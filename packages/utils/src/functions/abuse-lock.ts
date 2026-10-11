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

/**
 * Whether an abuse lock requires the guest to stay powered off.
 *
 * `power_off` is the only lock level that owns the guest's run state: the lock
 * reconciliation (`reconcileAbuseLocks`) re-applies it and counts a running
 * guest as drift. `throttle` and `isolate` leave power to the customer and the
 * workflows. A released lock clears `abuseLockedAt`.
 */
export const isHeldOffByAbuseLock = (server: {
  abuseLockedAt: Date | null;
  abuseLockLevel: string | null;
}): boolean =>
  server.abuseLockedAt !== null && server.abuseLockLevel === "power_off";
