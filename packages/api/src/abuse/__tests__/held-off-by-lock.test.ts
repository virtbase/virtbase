/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, test } from "bun:test";
import { isHeldOffByAbuseLock } from "../held-off-by-lock.ts";

const lockedAt = new Date("2026-10-01T00:00:00.000Z");

describe("isHeldOffByAbuseLock", () => {
  test("is true while a power_off lock is applied", () => {
    expect(
      isHeldOffByAbuseLock({
        abuseLockedAt: lockedAt,
        abuseLockLevel: "power_off",
      }),
    ).toBe(true);
  });

  test("is false for the levels that leave power to the customer", () => {
    expect(
      isHeldOffByAbuseLock({
        abuseLockedAt: lockedAt,
        abuseLockLevel: "throttle",
      }),
    ).toBe(false);
    expect(
      isHeldOffByAbuseLock({
        abuseLockedAt: lockedAt,
        abuseLockLevel: "isolate",
      }),
    ).toBe(false);
  });

  test("is false once the lock is released", () => {
    expect(
      isHeldOffByAbuseLock({ abuseLockedAt: null, abuseLockLevel: null }),
    ).toBe(false);
  });
});
