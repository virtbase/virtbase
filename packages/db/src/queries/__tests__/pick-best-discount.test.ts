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
import type { DiscountInput } from "../pick-best-discount";
import { applyDiscount, pickBestDiscount } from "../pick-best-discount";

const discount = (overrides: Partial<DiscountInput> = {}): DiscountInput => ({
  id: "dsc_test",
  type: "PERCENTAGE",
  amount: 10,
  appliesTo: "BOTH",
  ...overrides,
});

describe("applyDiscount", () => {
  test("PERCENTAGE applies an integer-percent reduction", () => {
    expect(
      applyDiscount(10_000, discount({ type: "PERCENTAGE", amount: 10 })),
    ).toBe(9_000);
    expect(
      applyDiscount(2_999, discount({ type: "PERCENTAGE", amount: 25 })),
    ).toBe(2_249);
  });

  test("PERCENTAGE clamps to 0 when amount is 100", () => {
    expect(
      applyDiscount(2_999, discount({ type: "PERCENTAGE", amount: 100 })),
    ).toBe(0);
  });

  test("FIXED subtracts cents from the price", () => {
    expect(applyDiscount(2_999, discount({ type: "FIXED", amount: 500 }))).toBe(
      2_499,
    );
  });

  test("FIXED clamps to 0 when amount exceeds price", () => {
    expect(
      applyDiscount(1_000, discount({ type: "FIXED", amount: 5_000 })),
    ).toBe(0);
  });
});

describe("pickBestDiscount", () => {
  const catalog = 10_000;

  test("returns no discount when the list is empty", () => {
    const result = pickBestDiscount(catalog, [], "purchase");
    expect(result.discount).toBeNull();
    expect(result.finalPrice).toBe(catalog);
  });

  test("filters out discounts that do not apply to the requested side", () => {
    const renewalOnly = discount({ id: "a", appliesTo: "RENEWAL", amount: 50 });
    const result = pickBestDiscount(catalog, [renewalOnly], "purchase");
    expect(result.discount).toBeNull();
    expect(result.finalPrice).toBe(catalog);
  });

  test("BOTH discounts apply to both sides", () => {
    const both = discount({ id: "a", appliesTo: "BOTH", amount: 10 });
    expect(pickBestDiscount(catalog, [both], "purchase").discount?.id).toBe(
      "a",
    );
    expect(pickBestDiscount(catalog, [both], "renewal").discount?.id).toBe("a");
  });

  test("picks the discount that yields the lowest final price across FIXED and PERCENTAGE", () => {
    const tenPercent = discount({
      id: "pct",
      type: "PERCENTAGE",
      amount: 10,
      appliesTo: "PURCHASE",
    });
    // 1500 cents off > 10 % of 10000 (1000 off)
    const bigFixed = discount({
      id: "fix",
      type: "FIXED",
      amount: 1500,
      appliesTo: "PURCHASE",
    });
    const smallFixed = discount({
      id: "small",
      type: "FIXED",
      amount: 500,
      appliesTo: "PURCHASE",
    });

    const result = pickBestDiscount(
      catalog,
      [tenPercent, bigFixed, smallFixed],
      "purchase",
    );
    expect(result.discount?.id).toBe("fix");
    expect(result.finalPrice).toBe(8_500);
  });

  test("ignores side-mismatched discounts even when they would be best", () => {
    const renewalBig = discount({
      id: "renewalBig",
      type: "PERCENTAGE",
      amount: 50,
      appliesTo: "RENEWAL",
    });
    const purchaseSmall = discount({
      id: "purchaseSmall",
      type: "FIXED",
      amount: 100,
      appliesTo: "PURCHASE",
    });

    const result = pickBestDiscount(
      catalog,
      [renewalBig, purchaseSmall],
      "purchase",
    );
    expect(result.discount?.id).toBe("purchaseSmall");
    expect(result.finalPrice).toBe(9_900);
  });
});
