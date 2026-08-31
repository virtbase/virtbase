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
import { billingAnchorDay, nextPeriodEnd } from "../period";

const at = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString();

describe("clamping to the length of the target month", () => {
  test("31 Jan + 1 month is 28 Feb", () => {
    expect(iso(nextPeriodEnd(at("2026-01-31T00:00:00.000Z"), 1))).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  test("31 Jan + 1 month is 29 Feb in a leap year", () => {
    expect(iso(nextPeriodEnd(at("2028-01-31T00:00:00.000Z"), 1))).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  test("30 Jan + 1 month is 28 Feb too", () => {
    // Two different anchors land on the same date; only the anchor tells them
    // apart afterwards.
    expect(iso(nextPeriodEnd(at("2026-01-30T00:00:00.000Z"), 1))).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  test("31 Mar + 1 month is 30 Apr", () => {
    expect(iso(nextPeriodEnd(at("2026-03-31T09:14:03.000Z"), 1))).toBe(
      "2026-04-30T09:14:03.000Z",
    );
  });

  test("a century year that is not a leap year still has 28 days", () => {
    expect(iso(nextPeriodEnd(at("2100-01-31T00:00:00.000Z"), 1))).toBe(
      "2100-02-28T00:00:00.000Z",
    );
  });
});

describe("the time of day is carried across untouched", () => {
  test("a subscription renewing at 09:14:03 keeps renewing at 09:14:03", () => {
    expect(iso(nextPeriodEnd(at("2026-05-15T09:14:03.457Z"), 1))).toBe(
      "2026-06-15T09:14:03.457Z",
    );
  });
});

describe("no drift", () => {
  test("31 Jan to Feb and back to 31 Mar", () => {
    // The property the whole module exists for. Adding a month to the clamped
    // value would give 28 Mar and lose the customer's day forever.
    const jan = at("2026-01-31T12:00:00.000Z");
    const feb = nextPeriodEnd(jan, 1);
    expect(iso(feb)).toBe("2026-02-28T12:00:00.000Z");

    const mar = nextPeriodEnd(
      feb,
      1,
      billingAnchorDay({
        currentPeriodStart: jan,
        currentPeriodEnd: feb,
      }),
    );
    expect(iso(mar)).toBe("2026-03-31T12:00:00.000Z");
  });

  test("naively re-anchoring on the clamped value is what drifts", () => {
    // The bug this guards against, stated as a test so nobody reintroduces it
    // by "simplifying" the anchor away.
    const feb = nextPeriodEnd(at("2026-01-31T12:00:00.000Z"), 1);
    expect(iso(nextPeriodEnd(feb, 1))).toBe("2026-03-28T12:00:00.000Z");
  });

  test("a whole year anchored on the 31st keeps its day", () => {
    let start = at("2025-12-31T00:00:00.000Z");
    let end = nextPeriodEnd(start, 1);

    const days: number[] = [end.getUTCDate()];
    for (let i = 0; i < 11; i++) {
      const anchor = billingAnchorDay({
        currentPeriodStart: start,
        currentPeriodEnd: end,
      });
      start = end;
      end = nextPeriodEnd(start, 1, anchor);
      days.push(end.getUTCDate());
    }

    // Jan..Dec 2026: every month's own last day where 31 does not exist, and
    // the 31st everywhere it does.
    expect(days).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });
});

describe("multi-month intervals", () => {
  test("31 Jan + 3 months is 30 Apr", () => {
    expect(iso(nextPeriodEnd(at("2026-01-31T00:00:00.000Z"), 3))).toBe(
      "2026-04-30T00:00:00.000Z",
    );
  });

  test("crosses the year boundary", () => {
    expect(iso(nextPeriodEnd(at("2026-11-30T00:00:00.000Z"), 2))).toBe(
      "2027-01-30T00:00:00.000Z",
    );
  });

  test("twelve months lands on the same date a year later", () => {
    expect(iso(nextPeriodEnd(at("2026-07-04T06:00:00.000Z"), 12))).toBe(
      "2027-07-04T06:00:00.000Z",
    );
  });

  test("29 Feb + 12 months clamps to 28 Feb in a common year", () => {
    expect(iso(nextPeriodEnd(at("2028-02-29T00:00:00.000Z"), 12))).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});

describe("daylight saving time", () => {
  test("a period across the European spring-forward keeps its UTC time", () => {
    // Europe/Berlin moves on 29 March 2026, America/New_York on 8 March.
    // Both fall inside this period; neither may move the instant of day.
    const from = at("2026-03-01T02:30:00.000Z");
    const to = nextPeriodEnd(from, 1);

    expect(iso(to)).toBe("2026-04-01T02:30:00.000Z");
    expect(to.getUTCHours()).toBe(from.getUTCHours());
    // Exactly 31 days. Local-time arithmetic would be an hour short.
    expect(to.getTime() - from.getTime()).toBe(31 * 24 * 60 * 60 * 1000);
  });

  test("a period across the autumn fall-back keeps its UTC time", () => {
    const from = at("2026-10-15T01:15:00.000Z");
    const to = nextPeriodEnd(from, 1);

    expect(iso(to)).toBe("2026-11-15T01:15:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(31 * 24 * 60 * 60 * 1000);
  });

  test("midnight does not slip into the previous day", () => {
    // The case that would move a whole period end by a day if the arithmetic
    // were done in a local calendar behind UTC.
    const to = nextPeriodEnd(at("2026-03-15T00:00:00.000Z"), 1);
    expect(iso(to)).toBe("2026-04-15T00:00:00.000Z");
  });
});

describe("billingAnchorDay", () => {
  test("recovers the anchor from a clamped period", () => {
    expect(
      billingAnchorDay({
        currentPeriodStart: at("2026-02-28T00:00:00.000Z"),
        currentPeriodEnd: at("2026-03-31T00:00:00.000Z"),
      }),
    ).toBe(31);
  });

  test("uses the start when it is the later day", () => {
    expect(
      billingAnchorDay({
        currentPeriodStart: at("2026-01-31T00:00:00.000Z"),
        currentPeriodEnd: at("2026-02-28T00:00:00.000Z"),
      }),
    ).toBe(31);
  });

  test("leaves an ordinary mid-month anchor alone", () => {
    expect(
      billingAnchorDay({
        currentPeriodStart: at("2026-01-15T00:00:00.000Z"),
        currentPeriodEnd: at("2026-02-15T00:00:00.000Z"),
      }),
    ).toBe(15);
  });

  test("works with only a start", () => {
    expect(
      billingAnchorDay({ currentPeriodStart: at("2026-01-09T00:00:00.000Z") }),
    ).toBe(9);
  });
});

describe("refusing nonsense", () => {
  test("a zero or negative interval would end a period before it began", () => {
    expect(() => nextPeriodEnd(at("2026-01-31T00:00:00.000Z"), 0)).toThrow(
      RangeError,
    );
    expect(() => nextPeriodEnd(at("2026-01-31T00:00:00.000Z"), -1)).toThrow(
      RangeError,
    );
  });

  test("a fractional interval is refused rather than rounded", () => {
    expect(() => nextPeriodEnd(at("2026-01-31T00:00:00.000Z"), 1.5)).toThrow(
      RangeError,
    );
  });

  test("an invalid date is refused rather than propagated", () => {
    expect(() => nextPeriodEnd(new Date("nonsense"), 1)).toThrow(RangeError);
  });
});
