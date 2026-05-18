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

import type { DatabaseDiscount } from "../schema";

/**
 * Minimal shape needed to evaluate a discount. Accepts both the full
 * `DatabaseDiscount` and a partial selection — useful for callers that
 * select a subset of columns.
 */
export type DiscountInput = Pick<
  DatabaseDiscount,
  "id" | "type" | "amount" | "appliesTo"
>;

/**
 * Which side of the price a discount is being evaluated for. Maps to the
 * `appliesTo` column where `purchase` matches `PURCHASE` or `BOTH` and
 * `renewal` matches `RENEWAL` or `BOTH`.
 */
export type DiscountSide = "purchase" | "renewal";

/**
 * Apply a single discount to a price in cents and return the resulting
 * price. Result is clamped at 0 — discounts can never produce a negative
 * total.
 *
 * - `PERCENTAGE`: `amount` is an integer percent 1-100 (e.g. 10 = 10 % off).
 * - `FIXED`: `amount` is in cents to subtract from `price`.
 */
export function applyDiscount(price: number, discount: DiscountInput): number {
  if (discount.type === "PERCENTAGE") {
    return Math.max(0, Math.floor((price * (100 - discount.amount)) / 100));
  }
  return Math.max(0, price - discount.amount);
}

/**
 * Pick the discount that results in the lowest final price for the given
 * side. Returns `{ discount: null, finalPrice: catalogPrice }` when no
 * discount applies.
 *
 * Discounts whose `appliesTo` does not cover the requested side are
 * filtered out. Date-window and `active` filtering must be performed by
 * the caller (typically in SQL).
 */
export function pickBestDiscount<T extends DiscountInput>(
  catalogPrice: number,
  discounts: readonly T[],
  side: DiscountSide,
): { discount: T | null; finalPrice: number } {
  const targetAppliesTo = side === "purchase" ? "PURCHASE" : "RENEWAL";

  let best: T | null = null;
  let bestPrice = catalogPrice;

  for (const discount of discounts) {
    if (
      discount.appliesTo !== targetAppliesTo &&
      discount.appliesTo !== "BOTH"
    ) {
      continue;
    }
    const candidatePrice = applyDiscount(catalogPrice, discount);
    if (candidatePrice < bestPrice) {
      best = discount;
      bestPrice = candidatePrice;
    }
  }

  return { discount: best, finalPrice: bestPrice };
}
