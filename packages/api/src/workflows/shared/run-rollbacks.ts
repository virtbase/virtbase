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

import { reportRollbackFailureStep } from "./report-rollback-failure";

/**
 * A compensation stack: the undo of every forward step that has already run,
 * pushed in the order the steps happened.
 */
export type Rollbacks = Array<() => Promise<void>>;

/**
 * Unwinds a compensation stack in reverse, and does not stop for a failure.
 *
 * Not a step and not a workflow - an orchestration helper, like
 * `deleteOneServer`, that runs inside whichever workflow calls it and awaits
 * the same steps the workflow body would have awaited inline.
 *
 * [!] The fault tolerance is the whole point. Rollbacks run newest-first, and
 * the newest ones are exactly the ones most likely to throw: they touch the
 * node that just broke the workflow. A bare `for (const r of rollbacks) await
 * r()` therefore turns one unreachable node into a permanent orphan - the VM
 * is never destroyed, the disk never freed, the server row and its subnet
 * allocations never removed - because the throw skips every *earlier*
 * compensation, which are the ones that would still have worked.
 *
 * So each compensation is attempted on its own, failures are reported the way
 * the rest of the codebase reports swallowed infrastructure failures, and the
 * caller still throws the original error: the workflow failed, and the reason
 * it failed is not "a rollback also failed".
 *
 * The array is left untouched - `reverse()` mutates in place, and a workflow
 * that is replayed must see the stack it built.
 */
export async function runRollbacks(rollbacks: Rollbacks, workflow: string) {
  const total = rollbacks.length;

  for (let i = 0; i < total; i++) {
    // Newest first: undo the most recent forward step before the ones it was
    // layered on top of.
    const rollback = rollbacks[total - 1 - i];
    if (!rollback) continue;

    try {
      await rollback();
    } catch (error) {
      try {
        await reportRollbackFailureStep({
          workflow,
          position: i + 1,
          total,
          reason: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Reporting must never be the reason the rest of the stack is skipped.
      }
    }
  }
}
