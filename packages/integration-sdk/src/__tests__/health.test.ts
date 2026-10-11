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
import {
  HEALTH_BUDGET_MAX_MS,
  HEALTH_BUDGET_MS,
  probeWithinBudget,
  resolveHealthBudgetMs,
} from "../health";

const at = new Date("2026-10-11T00:00:00Z");

describe("probeWithinBudget", () => {
  test("returns the probe's answer", async () => {
    expect(
      await probeWithinBudget({
        probe: async () => ({
          status: "degraded",
          checkedAt: at,
          message: "quota low",
        }),
      }),
    ).toEqual({ status: "degraded", checkedAt: at, message: "quota low" });
  });

  test("reports a thrown error as error", async () => {
    expect(
      await probeWithinBudget({
        probe: async () => {
          throw new Error("401 Unauthorized");
        },
        now: () => at,
      }),
    ).toEqual({ status: "error", checkedAt: at, message: "401 Unauthorized" });
  });

  test("reports a probe that outlives its budget as error", async () => {
    expect(
      await probeWithinBudget({
        probe: () => new Promise(() => {}),
        budgetMs: 10,
        now: () => at,
      }),
    ).toEqual({
      status: "error",
      checkedAt: at,
      message: "The health probe did not answer within 10 ms",
    });
  });

  test("reports a probe that throws synchronously as error", async () => {
    expect(
      await probeWithinBudget({
        probe: () => {
          throw new Error("not async");
        },
        now: () => at,
      }),
    ).toEqual({ status: "error", checkedAt: at, message: "not async" });
  });
});

describe("resolveHealthBudgetMs", () => {
  test("defaults to HEALTH_BUDGET_MS and caps at HEALTH_BUDGET_MAX_MS", () => {
    expect(resolveHealthBudgetMs()).toBe(HEALTH_BUDGET_MS);
    expect(resolveHealthBudgetMs(1_000)).toBe(1_000);
    expect(resolveHealthBudgetMs(60_000)).toBe(HEALTH_BUDGET_MAX_MS);
  });
});
