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

import type { useFormatter } from "next-intl";

type DiscountLike = {
  type: "PERCENTAGE" | "FIXED";
  amount: number;
};

/**
 * Render the savings label for a discount badge.
 *
 * - `PERCENTAGE` renders `-{amount}%` (e.g. `-10%`).
 * - `FIXED` renders the EUR equivalent of the `amount` cents prefixed with
 *   a minus sign (e.g. `-€10.00`).
 */
export function formatDiscountLabel(
  discount: DiscountLike,
  format: ReturnType<typeof useFormatter>,
): string {
  if (discount.type === "PERCENTAGE") {
    return format.number(-1 * (discount.amount / 100), {
      style: "percent",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return format.number(-1 * (discount.amount / 100), {
    style: "currency",
    currency: "EUR",
  });
}
