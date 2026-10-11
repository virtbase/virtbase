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

import { isIntegrationError } from "@virtbase/integration-sdk";
import { countBlocks, splitIntoBlocks } from "./blocks";
import { isQuotaExhausted } from "./client";

/** A target the sweep checks in full, and the blocks it checks it as. */
export interface PlannedTarget {
  cidr: string;
  blocks: string[];
}

/** Which targets one sweep checks, and why it leaves the others. */
export interface SweepPlan {
  /** The targets to check, in the order offered; their blocks add up to at most the run's calls. */
  planned: PlannedTarget[];
  /**
   * Targets that fit the run's calls but not what the planned targets before
   * them leave. They keep their watermark, and `collectPollTargets` orders a
   * target never swept, or swept longest ago, ahead of the ones this run
   * covers.
   */
  deferred: string[];
  /** Targets with more blocks than the run has calls, which no run of this size covers. */
  unaffordable: { cidr: string; blocks: number }[];
}

/**
 * Plans one sweep: every target whose blocks fit the calls left after the
 * targets before it, in the order offered.
 *
 * A target is planned whole or not at all. A target started and left
 * unfinished has no cursor, so the poller would offer it first again on every
 * run, spend the run on it, and never reach the targets behind it.
 *
 * @throws IntegrationError `abuseipdb.invalid_target` for a malformed target
 * (see {@link countBlocks}).
 */
export const planSweep = ({
  targets,
  blockPrefixLength,
  calls,
}: {
  targets: readonly string[];
  blockPrefixLength: number;
  calls: number;
}): SweepPlan => {
  const plan: SweepPlan = { planned: [], deferred: [], unaffordable: [] };
  let left = calls;
  for (const cidr of targets) {
    const blocks = countBlocks(cidr, blockPrefixLength);
    if (blocks > calls) {
      plan.unaffordable.push({ cidr, blocks });
    } else if (blocks > left) {
      plan.deferred.push(cidr);
    } else {
      plan.planned.push({
        cidr,
        blocks: splitIntoBlocks(cidr, blockPrefixLength),
      });
      left -= blocks;
    }
  }
  return plan;
};

/**
 * What a failed provider call means for the sweep it belongs to.
 *
 * - `stop`: the daily quota is spent. Every further call would fail, so the
 *   sweep ends and returns what it covered.
 * - `fatal`: an {@link IntegrationError} that is not retryable (a refused key,
 *   a rejected request, an answer that is not AbuseIPDB's), so every later
 *   call fails the same way; or any other error, which marks a defect in this
 *   package, because the client translates every provider failure into an
 *   `IntegrationError`. The sweep rethrows it, and the abuse poller records
 *   the run as failed.
 * - `skip`: a retryable error, such as a 5xx or a timeout. The block stays
 *   unchecked, its target uncovered, and the sweep goes on.
 */
export const classifySweepFailure = (
  error: unknown,
): "stop" | "fatal" | "skip" => {
  if (isQuotaExhausted(error)) return "stop";
  if (!isIntegrationError(error) || !error.retryable) return "fatal";
  return "skip";
};
