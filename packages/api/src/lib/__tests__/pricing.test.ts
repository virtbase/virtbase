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
  calculateProRataUpgrade,
  MIN_CHARGE_EUR_CENTS,
  MONTH_MS,
} from "../pricing";

const now = new Date("2026-08-09T12:00:00.000Z");
const inDays = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

const upgrade = (
  overrides: Partial<Parameters<typeof calculateProRataUpgrade>[0]> = {},
) =>
  calculateProRataUpgrade({
    currentRenewalPrice: 1_000,
    newRenewalPrice: 2_000,
    terminatesAt: inDays(30),
    now,
    ...overrides,
  });

describe("calculateProRataUpgrade", () => {
  test("charges the full difference when the whole term is unused", () => {
    expect(upgrade()).toMatchObject({
      rawAmount: 1_000,
      amount: 1_000,
      chargeable: true,
      remainingTermFraction: 1,
    });
  });

  test("scales the difference by the remaining term", () => {
    expect(upgrade({ terminatesAt: inDays(15) })).toMatchObject({
      rawAmount: 500,
      amount: 500,
      chargeable: true,
    });
  });

  test("charges every remaining month of a multi-month term", () => {
    // Extensions each add a month and nothing caps how many a customer may
    // buy, while an upgrade leaves `terminatesAt` alone — so three months left
    // is three months of the dearer plan, and must be priced as three.
    // Clamping this to one month was how six extensions bought five months of
    // the more expensive plan for free.
    expect(upgrade({ terminatesAt: inDays(90) })).toMatchObject({
      rawAmount: 3_000,
      amount: 3_000,
      chargeable: true,
      remainingTermFraction: 3,
    });
  });

  test("prices a part-used multi-month term by what is left of it", () => {
    // Half a month into a two-month term: 1.5 months of the difference.
    expect(upgrade({ terminatesAt: inDays(45) })).toMatchObject({
      rawAmount: 1_500,
      remainingTermFraction: 1.5,
    });
  });

  test("rounds down, so the customer is never overcharged by rounding", () => {
    // 999 * (1/3 of a month) = 333.0 exactly; use a difference that does not
    // divide evenly to exercise the floor.
    const result = upgrade({
      currentRenewalPrice: 0,
      newRenewalPrice: 100,
      terminatesAt: new Date(now.getTime() + MONTH_MS / 3),
    });

    expect(result.rawAmount).toBe(33);
  });

  test("lifts a small but real charge to the provider minimum", () => {
    const result = upgrade({
      currentRenewalPrice: 1_000,
      newRenewalPrice: 1_010,
      terminatesAt: inDays(3),
    });

    expect(result.rawAmount).toBe(1);
    expect(result.amount).toBe(MIN_CHARGE_EUR_CENTS);
    expect(result.chargeable).toBe(true);
  });

  test("does not lift a zero charge to the minimum", () => {
    // Otherwise a customer with nothing to pay would be charged 50 cents.
    const result = upgrade({ newRenewalPrice: 1_000 });

    expect(result.rawAmount).toBe(0);
    expect(result.amount).toBe(0);
    expect(result.chargeable).toBe(false);
  });

  test("treats a lapsed term as nothing to charge", () => {
    expect(upgrade({ terminatesAt: inDays(-1) })).toMatchObject({
      rawAmount: 0,
      amount: 0,
      chargeable: false,
      remainingTermFraction: 0,
    });
  });

  test("treats a server with no term as nothing to charge", () => {
    expect(upgrade({ terminatesAt: null })).toMatchObject({
      amount: 0,
      chargeable: false,
    });
  });

  test("treats a cheaper target plan as nothing to charge, not a refund", () => {
    expect(upgrade({ newRenewalPrice: 500 })).toMatchObject({
      rawAmount: 0,
      amount: 0,
      chargeable: false,
    });
  });

  test("honours an overridden minimum", () => {
    const result = upgrade({
      currentRenewalPrice: 1_000,
      newRenewalPrice: 1_010,
      terminatesAt: inDays(3),
      minimumCharge: 200,
    });

    expect(result.amount).toBe(200);
  });
});

describe("quote and charge agree", () => {
  /**
   * The plan router and the checkout router used to compute this separately,
   * and disagreed for `rawAmount === 0`: the quote showed 0 while checkout
   * rejected the order. Both now read the same result, so the only remaining
   * question is how each chooses to present it.
   */
  test("an unchargeable upgrade is reported as zero and not chargeable", () => {
    const result = upgrade({ terminatesAt: inDays(-1) });

    // What the plan list shows today.
    expect(result.amount).toBe(0);
    // What checkout branches on.
    expect(result.chargeable).toBe(false);
  });

  test("every chargeable upgrade has a non-zero amount", () => {
    for (const days of [1, 5, 10, 20, 30]) {
      for (const newPrice of [1_001, 1_050, 2_000, 10_000]) {
        const result = upgrade({
          terminatesAt: inDays(days),
          newRenewalPrice: newPrice,
        });

        if (result.chargeable) {
          expect(result.amount).toBeGreaterThanOrEqual(MIN_CHARGE_EUR_CENTS);
        } else {
          expect(result.amount).toBe(0);
        }
      }
    }
  });
});
