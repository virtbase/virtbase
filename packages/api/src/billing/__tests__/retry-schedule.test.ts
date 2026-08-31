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
import { RENEWAL_RETRY_SCHEDULE_DAYS } from "@virtbase/utils";
import {
  exhaustedRenewalAttempt,
  isRenewalLadderExhausted,
  nextRenewalAttemptAt,
  renewalRetryDelayDays,
} from "../retry-schedule";

const DAY = 24 * 60 * 60 * 1000;

describe("the dunning ladder", () => {
  test("lands the attempts where the schedule promises, measured from the first decline", () => {
    const firstDecline = new Date("2026-03-01T09:00:00.000Z");

    let at = firstDecline;
    const attempts: number[] = [];

    for (
      let decline = 1;
      decline <= RENEWAL_RETRY_SCHEDULE_DAYS.length;
      decline++
    ) {
      const next = nextRenewalAttemptAt(decline, at);
      if (!next) throw new Error(`expected a rung for decline ${decline}`);

      attempts.push((next.getTime() - firstDecline.getTime()) / DAY);
      // The next decline happens at the retry, which is what makes the gaps
      // add up to the promised offsets.
      at = next;
    }

    expect(attempts).toEqual([...RENEWAL_RETRY_SCHEDULE_DAYS]);
  });

  test("runs out after the last rung", () => {
    const last = RENEWAL_RETRY_SCHEDULE_DAYS.length;

    expect(renewalRetryDelayDays(last)).not.toBeNull();
    expect(renewalRetryDelayDays(last + 1)).toBeNull();
    expect(isRenewalLadderExhausted(last)).toBe(false);
    expect(isRenewalLadderExhausted(last + 1)).toBe(true);
    expect(nextRenewalAttemptAt(last + 1)).toBeNull();
  });

  test("refuses to schedule a retry for an attempt that has not declined", () => {
    expect(() => renewalRetryDelayDays(0)).toThrow(RangeError);
  });

  test("can be spent in one go, and only ever forwards", () => {
    // A decline that can never come good jumps past the last rung...
    expect(isRenewalLadderExhausted(exhaustedRenewalAttempt(0))).toBe(true);
    // ...from wherever the ladder had got to.
    expect(exhaustedRenewalAttempt(9)).toBe(10);
  });
});
