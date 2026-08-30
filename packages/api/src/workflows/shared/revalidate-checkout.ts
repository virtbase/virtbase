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

import { revalidateTag } from "next/cache";

/**
 * Drops the cached plan and price listing the checkout reads.
 *
 * [!] Always through this helper, never `revalidateTag` directly.
 * `revalidateTag` needs Next's static generation store, which exists when a
 * workflow step runs behind a route but not when the same step is called from
 * a cron, a script or a test - and there it throws. Every one of these calls
 * sits *after* a committed transaction, so an unguarded one turns a successful
 * write into a failed step: the runtime retries a step whose work is already
 * done, and what should have been a cache hint becomes a workflow that cannot
 * finish.
 *
 * A stale plan listing is not a reason to fail anything.
 */
export function revalidateCheckout() {
  try {
    revalidateTag("checkout", "max");
  } catch {
    // No request context. Nothing to invalidate, and nothing to report.
  }
}
