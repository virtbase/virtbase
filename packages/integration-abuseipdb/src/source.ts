/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type {
  AbusePollRequest,
  AbusePollResult,
  AbuseSource,
  InboundSignal,
  SignalSeverity,
} from "@virtbase/ports";
import { categoryNames, dominantCategory } from "./categories";
import type { AbuseIpDbCheckBlock, AbuseIpDbClient } from "./client";
import { createAbuseIpDbClient } from "./client";
import type { AbuseIpDbContext } from "./config";
import type { PlannedTarget } from "./sweep";
import { classifySweepFailure, planSweep } from "./sweep";

/** The source id every signal of this package carries. */
export const SOURCE = "abuseipdb";

/**
 * How a confidence score becomes a severity.
 *
 * AbuseIPDB's score is how sure its reporters collectively are, not how bad
 * the thing is - so this is deliberately conservative, and the rules are where
 * a deployment decides what any of it is worth acting on.
 */
const severityFor = (score: number): SignalSeverity => {
  if (score >= 90) return "critical";
  if (score >= 60) return "warning";
  return "info";
};

type ReportedAddress = AbuseIpDbCheckBlock["reportedAddress"][number];

/**
 * The provider calls one sweep has left. `reserved` is the part of `calls`
 * that the blocks of the target in progress still need, which enrichment must
 * not spend.
 */
interface CallBudget {
  calls: number;
  reserved: number;
}

/**
 * The AbuseIPDB block sweep.
 *
 * A pull source because there is no push side: AbuseIPDB has no webhook, so
 * the only way to learn that one of our addresses is being reported is to ask.
 *
 * The ranges come from the platform rather than from configuration. An
 * integration must not read the database, and a source that chose its own
 * targets could be pointed at somebody else's address space.
 */
export class AbuseIpDbSource implements AbuseSource {
  readonly id = SOURCE;

  private readonly ctx: AbuseIpDbContext;
  private readonly client: AbuseIpDbClient;

  constructor(ctx: AbuseIpDbContext, client?: AbuseIpDbClient) {
    this.ctx = ctx;
    this.client =
      client ??
      createAbuseIpDbClient({
        apiKey: ctx.secrets.apiKey,
        http: ctx.http,
        logger: ctx.logger,
      });
  }

  /**
   * Sweeps the targets {@link planSweep} plans for the smaller of the run's
   * budget and `callsPerRun`, one `check-block` call per block of
   * `blockPrefixLength`. Every call is counted against that budget before it
   * is made, whether it succeeds or not.
   *
   * A target counts as covered once every one of its blocks was checked. A
   * target the plan leaves out is not started: one with more blocks than the
   * run has calls is logged as a warning, naming its range and block count.
   *
   * A failed call is handled as {@link classifySweepFailure} decides: the
   * daily quota ends the sweep, which returns what it covered; a retryable
   * error leaves its target uncovered; any other error rejects the poll, and
   * the abuse poller (`pollAbuseSources`) records the run as failed.
   *
   * @throws IntegrationError `abuseipdb.request_failed` or
   * `abuseipdb.unexpected_response` when AbuseIPDB refuses the key or a
   * request, and `abuseipdb.invalid_target` for a malformed target.
   */
  async poll(request: AbusePollRequest): Promise<AbusePollResult> {
    // The platform bounds how much work it will wait for; `callsPerRun` bounds
    // what the key can afford. Whichever is smaller wins.
    const calls = Math.min(request.budget, this.ctx.settings.callsPerRun);
    const plan = planSweep({
      targets: request.targets.map((target) => target.cidr),
      blockPrefixLength: this.ctx.settings.blockPrefixLength,
      calls,
    });
    for (const { cidr, blocks } of plan.unaffordable) {
      this.ctx.logger.warn("Skipping a target wider than one run can sweep", {
        cidr,
        blocks,
        calls,
      });
    }

    const budget: CallBudget = { calls, reserved: 0 };
    const signals: InboundSignal[] = [];
    const covered: string[] = [];
    try {
      for (const target of plan.planned) {
        // Enrichment of an earlier target may have spent the calls the plan
        // counted for this one; starting it anyway would leave it unfinished.
        if (target.blocks.length > budget.calls) continue;
        if (await this.sweepTarget({ target, budget, signals })) {
          covered.push(target.cidr);
        }
      }
    } catch (error) {
      if (classifySweepFailure(error) !== "stop") throw error;
      // The quota is daily, and every further call would only spend
      // tomorrow's. What was found so far is kept, and the uncovered ranges
      // keep their watermark for the next run.
      this.ctx.logger.warn("Stopping sweep: quota exhausted", {
        covered: covered.length,
        remaining: request.targets.length - covered.length,
      });
    }

    return {
      signals,
      covered,
      ...(null === this.client.quotaRemaining
        ? {}
        : { quotaRemaining: this.client.quotaRemaining }),
    };
  }

  /**
   * Checks every block of one target, and returns whether all were checked.
   * The target's blocks are reserved in `budget` first, so enrichment of a
   * finding in an early block never spends a call a later block needs.
   */
  private async sweepTarget({
    target,
    budget,
    signals,
  }: {
    target: PlannedTarget;
    budget: CallBudget;
    signals: InboundSignal[];
  }): Promise<boolean> {
    budget.reserved = target.blocks.length;
    let complete = true;
    for (const block of target.blocks) {
      complete =
        (await this.sweepBlock({
          cidr: target.cidr,
          block,
          budget,
          signals,
        })) && complete;
    }
    return complete;
  }

  /**
   * Checks one block; false when the call failed with a retryable error.
   *
   * @throws the call's error when {@link classifySweepFailure} answers `stop`
   * or `fatal`.
   */
  private async sweepBlock({
    cidr,
    block,
    budget,
    signals,
  }: {
    cidr: string;
    block: string;
    budget: CallBudget;
    signals: InboundSignal[];
  }): Promise<boolean> {
    budget.calls -= 1;
    budget.reserved -= 1;
    let result: AbuseIpDbCheckBlock;
    try {
      result = await this.client.checkBlock(block, {
        maxAgeInDays: this.ctx.settings.maxAgeInDays,
      });
    } catch (error) {
      if (classifySweepFailure(error) !== "skip") throw error;
      this.ctx.logger.error("Block check failed", {
        cidr: block,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
    for (const reported of result.reportedAddress) {
      const signal = await this.toSignal({ cidr, reported, budget });
      if (signal) signals.push(signal);
    }
    return true;
  }

  /** The signal for one reported address, or null below the threshold. */
  private async toSignal({
    cidr,
    reported,
    budget,
  }: {
    cidr: string;
    reported: ReportedAddress;
    budget: CallBudget;
  }): Promise<InboundSignal | null> {
    const { confidenceThreshold, maxAgeInDays } = this.ctx.settings;
    if (reported.abuseConfidenceScore < confidenceThreshold) return null;
    // Reports older than the window are not what the sweep is for; the
    // provider filters by age but still lists addresses with none.
    if (!reported.mostRecentReport) return null;

    const { category, names } = await this.enrich(reported.ipAddress, budget);
    return {
      source: SOURCE,
      // Stable per address per report time: a continuing abuser produces a
      // fresh signal that joins the open case, and a repeat sweep over the
      // same report produces the same id and is deduplicated.
      externalId: `${reported.ipAddress}:${reported.mostRecentReport}`,
      type: `abuse.${category}`,
      state: "firing",
      severity: severityFor(reported.abuseConfidenceScore),
      subject: { kind: "ip", value: reported.ipAddress },
      title: `${reported.ipAddress} reported to AbuseIPDB by ${reported.numReports} source(s)`,
      body: [
        `Confidence: ${reported.abuseConfidenceScore}%`,
        `Reports in the last ${maxAgeInDays} days: ${reported.numReports}`,
        names.length > 0 ? `Categories: ${names.join(", ")}` : null,
        `https://www.abuseipdb.com/check/${reported.ipAddress}`,
      ]
        .filter(Boolean)
        .join("\n"),
      labels: { block: cidr },
      confidence: reported.abuseConfidenceScore,
      reporter: { organization: "AbuseIPDB" },
      occurredAt: new Date(reported.mostRecentReport),
      raw: reported,
    };
  }

  /**
   * One extra call buys the customer a case that says what to fix instead of
   * one labelled "other". Only with `enrichCategories` and a call to spare
   * beyond `budget.reserved`, because on a free key it doubles the cost of
   * every finding.
   *
   * A failed lookup costs the category, not the finding: every failure but the
   * daily quota is logged and the finding is filed as "other". A key AbuseIPDB
   * refuses has already failed the `check-block` call before the lookup.
   *
   * @throws IntegrationError `abuseipdb.quota_exhausted`, to end the sweep.
   */
  private async enrich(
    ip: string,
    budget: CallBudget,
  ): Promise<{ category: string; names: string[] }> {
    const none = { category: "other", names: [] };
    if (!this.ctx.settings.enrichCategories) return none;
    if (budget.calls <= budget.reserved) return none;
    budget.calls -= 1;
    try {
      const detail = await this.client.check(ip, {
        maxAgeInDays: this.ctx.settings.maxAgeInDays,
        verbose: true,
      });
      const numeric = (detail.reports ?? []).flatMap(
        (report) => report.categories,
      );
      return numeric.length > 0
        ? { category: dominantCategory(numeric), names: categoryNames(numeric) }
        : none;
    } catch (error) {
      if (classifySweepFailure(error) === "stop") throw error;
      this.ctx.logger.warn("Enrichment failed", {
        ip,
        error: error instanceof Error ? error.message : String(error),
      });
      return none;
    }
  }
}
