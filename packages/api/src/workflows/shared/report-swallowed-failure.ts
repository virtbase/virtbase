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

type ReportSwallowedFailureStepParams = {
  /** The workflow the failure happened in. */
  workflow: string;
  /** What was being attempted, usually the step's name. */
  operation: string;
  /** The failure, already flattened to a string by the caller. */
  reason: string;
};

/**
 * Records something a workflow deliberately failed to do and carried on from.
 *
 * A step rather than a plain function so `@sentry/node` stays out of the
 * workflow module graph - a workflow body cannot load `node:crypto`, and Sentry
 * reaches it. The workflow compiler only replaces a step module with a stub
 * when every one of its exports is a step, so this file exports nothing else.
 *
 * The house pattern, the same one `reconcile-backup.ts` applies to Proxmox:
 * report it and swallow it, so an unreachable dependency never fails the
 * caller. Used for post-success side effects, where the work the customer paid
 * for is already done and rolling it back would be the greater harm.
 */
export async function reportSwallowedFailureStep({
  workflow,
  operation,
  reason,
}: ReportSwallowedFailureStepParams) {
  "use step";

  const message = `[${workflow}] ${operation} failed and was swallowed: ${reason}`;

  console.warn(`[@virtbase/api] ${message}`);
  Sentry.captureMessage(message, "warning");
}
