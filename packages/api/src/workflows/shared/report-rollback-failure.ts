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

import * as Sentry from "@sentry/node";

type ReportRollbackFailureStepParams = {
  /** The workflow whose compensation stack was unwinding. */
  workflow: string;
  /**
   * Position of the failed compensation in the stack, counted from the one
   * that ran first. Enough to identify it without carrying a closure name
   * through durable state.
   */
  position: number;
  /** How many compensations the stack held in total. */
  total: number;
  /** The failure, already flattened to a string by the caller. */
  reason: string;
};

/**
 * Records a compensation that could not be carried out.
 *
 * A step rather than a plain function purely so `@sentry/node` stays out of
 * the workflow module graph - a workflow body cannot load `node:crypto`, and
 * Sentry reaches it. Steps run in the ordinary Node runtime, where it is fine.
 *
 * Follows the house rule for Proxmox failures we deliberately swallow: report
 * it and carry on. A rollback that throws is a resource nobody will reclaim
 * unless somebody is told about it.
 */
export async function reportRollbackFailureStep({
  workflow,
  position,
  total,
  reason,
}: ReportRollbackFailureStepParams) {
  "use step";

  const message = `[${workflow}] Rollback ${position}/${total} failed and was skipped: ${reason}`;

  console.error(`[@virtbase/api] ${message}`);
  Sentry.captureMessage(message, "error");
}
