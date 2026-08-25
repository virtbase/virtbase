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

import { describe, expect, test } from "bun:test";

import { millisecondsSince, snowflakeCreatedAt } from "../snowflake";

/** Builds the snowflake Discord would have minted at a given moment. */
const snowflakeAt = (date: Date): string =>
  String((BigInt(date.getTime()) - 1_420_070_400_000n) << 22n);

describe("snowflakeCreatedAt", () => {
  test("it reads the timestamp Discord encoded", () => {
    const when = new Date("2026-08-25T19:27:00.000Z");

    expect(snowflakeCreatedAt(snowflakeAt(when))?.toISOString()).toBe(
      when.toISOString(),
    );
  });

  test("a real interaction id decodes to a plausible date", () => {
    // The id from the timed-out `/help` in the dev log.
    const created = snowflakeCreatedAt("1541890040484073604");

    expect(created).not.toBeNull();
    expect(created?.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
  });

  test("a malformed id is null rather than a nonsense date", () => {
    // Diagnostics must never be the thing that throws inside a handler.
    expect(snowflakeCreatedAt("")).toBeNull();
    expect(snowflakeCreatedAt("not-a-snowflake")).toBeNull();
    expect(snowflakeCreatedAt("12n")).toBeNull();
  });
});

describe("millisecondsSince", () => {
  test("it measures against Discord's clock, not ours", () => {
    const twoSecondsAgo = snowflakeAt(new Date(Date.now() - 2000));
    const elapsed = millisecondsSince(twoSecondsAgo);

    expect(elapsed).toBeGreaterThanOrEqual(1990);
    expect(elapsed).toBeLessThan(2500);
  });

  test("a malformed id yields null, not NaN", () => {
    expect(millisecondsSince("nope")).toBeNull();
  });
});
