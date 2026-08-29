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
import type { AbuseIpDbClient } from "./client";
import { AbuseIpDbQuotaError, createAbuseIpDbClient } from "./client";
import type { AbuseIpDbContext } from "./config";

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
        logger: ctx.logger,
      });
  }

  async poll(request: AbusePollRequest): Promise<AbusePollResult> {
    const { confidenceThreshold, maxAgeInDays, enrichCategories } =
      this.ctx.settings;

    const signals: InboundSignal[] = [];
    const covered: string[] = [];

    // The platform bounds how much work it will wait for; this bounds what the
    // key can actually afford. Whichever is smaller wins.
    let budget = Math.min(request.budget, this.ctx.settings.callsPerRun);

    for (const target of request.targets) {
      if (budget <= 0) break;

      try {
        const block = await this.client.checkBlock(target.cidr, {
          maxAgeInDays,
        });
        budget -= 1;

        for (const reported of block.reportedAddress) {
          if (reported.abuseConfidenceScore < confidenceThreshold) continue;

          // Reports older than the window are not what the sweep is for; the
          // provider filters by age but still lists addresses with none.
          if (!reported.mostRecentReport) continue;

          let category = "other";
          let names: string[] = [];

          // One extra call buys the customer a case that says what to fix
          // instead of one labelled "other". Off by default, because on a free
          // key it doubles the cost of every finding.
          if (enrichCategories && budget > 0) {
            try {
              const detail = await this.client.check(reported.ipAddress, {
                maxAgeInDays,
                verbose: true,
              });
              budget -= 1;

              const numeric = (detail.reports ?? []).flatMap(
                (report) => report.categories,
              );
              if (numeric.length > 0) {
                category = dominantCategory(numeric);
                names = categoryNames(numeric);
              }
            } catch (error) {
              if (error instanceof AbuseIpDbQuotaError) throw error;
              // An enrichment failure costs detail, not the finding.
              this.ctx.logger.warn("[abuseipdb] Enrichment failed", {
                ip: reported.ipAddress,
              });
            }
          }

          signals.push({
            source: SOURCE,
            // Stable per address per report time: a continuing abuser produces
            // a fresh signal that joins the open case, and a repeat sweep over
            // the same report produces the same id and is deduplicated.
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
            labels: { block: target.cidr },
            confidence: reported.abuseConfidenceScore,
            reporter: { organization: "AbuseIPDB" },
            occurredAt: new Date(reported.mostRecentReport),
            raw: reported,
          });
        }

        covered.push(target.cidr);
      } catch (error) {
        if (error instanceof AbuseIpDbQuotaError) {
          // Stop rather than continue. The quota is daily, and every further
          // call would only spend tomorrow's. What was found so far is kept,
          // and the uncovered ranges keep their watermark for the next run.
          this.ctx.logger.warn("[abuseipdb] Stopping sweep: quota exhausted", {
            covered: covered.length,
            remaining: request.targets.length - covered.length,
          });
          break;
        }

        // One unreachable range must not lose the rest of the sweep.
        this.ctx.logger.error("[abuseipdb] Block check failed", {
          cidr: target.cidr,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      signals,
      covered,
      ...(null === this.client.quotaRemaining
        ? {}
        : { quotaRemaining: this.client.quotaRemaining }),
    };
  }
}
