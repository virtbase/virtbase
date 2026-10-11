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
import { IntegrationError } from "@virtbase/integration-sdk";
import { QUOTA_EXHAUSTED } from "../client";
import { classifySweepFailure, planSweep } from "../sweep";

describe("planSweep", () => {
  test("plans one block per /24 target at the default size, in order, until the calls run out", () => {
    expect(
      planSweep({
        targets: ["1.0.0.0/24", "2.0.0.0/24", "3.0.0.0/24"],
        blockPrefixLength: 24,
        calls: 2,
      }),
    ).toEqual({
      planned: [
        { cidr: "1.0.0.0/24", blocks: ["1.0.0.0/24"] },
        { cidr: "2.0.0.0/24", blocks: ["2.0.0.0/24"] },
      ],
      deferred: ["3.0.0.0/24"],
      unaffordable: [],
    });
  });

  test("defers a target that fits the run but not the calls left after the ones before it", () => {
    const plan = planSweep({
      targets: ["10.0.0.0/24", "10.0.1.0/24"],
      blockPrefixLength: 26,
      calls: 4,
    });

    expect(plan.planned.map((target) => target.cidr)).toEqual(["10.0.0.0/24"]);
    expect(plan.planned[0]?.blocks).toHaveLength(4);
    expect(plan.deferred).toEqual(["10.0.1.0/24"]);
    expect(plan.unaffordable).toEqual([]);
  });

  test("never plans a target with more blocks than the run has calls", () => {
    expect(
      planSweep({
        targets: ["10.0.0.0/24", "10.0.1.0/24"],
        blockPrefixLength: 26,
        calls: 2,
      }),
    ).toEqual({
      planned: [],
      deferred: [],
      unaffordable: [
        { cidr: "10.0.0.0/24", blocks: 4 },
        { cidr: "10.0.1.0/24", blocks: 4 },
      ],
    });
  });

  test("fills the calls a deferred target leaves with a later one that fits", () => {
    const plan = planSweep({
      targets: ["10.0.0.0/24", "10.0.1.0/24", "10.0.2.0/26"],
      blockPrefixLength: 26,
      calls: 5,
    });

    expect(plan.planned.map((target) => target.cidr)).toEqual([
      "10.0.0.0/24",
      "10.0.2.0/26",
    ]);
    expect(plan.deferred).toEqual(["10.0.1.0/24"]);
  });
});

describe("classifySweepFailure", () => {
  test("stops the sweep on the daily quota", () => {
    expect(
      classifySweepFailure(
        new IntegrationError({ code: QUOTA_EXHAUSTED, message: "quota" }),
      ),
    ).toBe("stop");
  });

  test("fails the sweep on an error that is not retryable, such as a refused key", () => {
    expect(
      classifySweepFailure(
        new IntegrationError({
          code: "abuseipdb.request_failed",
          message: "GET /check-block answered 401",
          params: { status: 401 },
        }),
      ),
    ).toBe("fatal");
  });

  test("skips the block on a retryable error, such as a 5xx or a timeout", () => {
    for (const code of [
      "abuseipdb.request_failed",
      "abuseipdb.http_timeout",
    ] as const) {
      expect(
        classifySweepFailure(
          new IntegrationError({ code, message: "later", retryable: true }),
        ),
      ).toBe("skip");
    }
  });

  test("fails the sweep on an error that is not an IntegrationError", () => {
    expect(classifySweepFailure(new TypeError("defect"))).toBe("fatal");
  });
});
