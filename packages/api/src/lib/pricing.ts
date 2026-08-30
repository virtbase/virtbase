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

/**
 * What an order costs.
 *
 * Pure by design and free of database access, so the number quoted to a
 * customer and the number they are charged come from one place. They used to be
 * computed separately in the plan router and the checkout router, which is how
 * they drifted apart.
 */

/**
 * A billing term is treated as a flat 30 days.
 *
 * Renewals add `INTERVAL '1 month'`, which is a calendar month, so the two
 * disagree by up to a day and a half per month. Reconciling them needs the
 * term's start date — which is not an input here — so the flat month stays.
 */
export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Stripe rejects EUR PaymentIntents below 50 cents, so a pro-rata charge that
 * rounds below it is lifted to the minimum rather than failing at the provider.
 *
 * A provider constraint leaking into pricing is not ideal; it belongs to
 * `PaymentProvider` once both providers are behind the port.
 */
export const MIN_CHARGE_EUR_CENTS = 50;

export interface ProRataUpgradeInput {
  /** What the customer currently pays to renew, in cents. */
  currentRenewalPrice: number;
  /** What renewing the plan they are upgrading to would cost, in cents. */
  newRenewalPrice: number;
  /** End of the customer's current term; `null` when they have no term left. */
  terminatesAt: Date | null;
  now?: Date;
  minimumCharge?: number;
}

export interface ProRataUpgrade {
  /** The pro-rata difference before the provider minimum is applied. */
  rawAmount: number;
  /**
   * What the customer is charged today, in cents, after the minimum is
   * applied. Zero when there is nothing to charge.
   */
  amount: number;
  /**
   * Whether this upgrade can be charged at all.
   *
   * `false` means the term has lapsed or the target plan is no more expensive,
   * so there is no money to take. Checkout refuses these; the plan list
   * currently still prices them at zero, which is the divergence this module
   * exists to make visible.
   */
  chargeable: boolean;
  /**
   * How much of the term is left, counted in billing months.
   *
   * `1` is a full month. It is deliberately *not* clamped to 1: a customer may
   * buy any number of monthly extensions, and an upgrade leaves `terminatesAt`
   * where it is, so a six-month term really does hand the customer six months
   * of the more expensive plan.
   */
  remainingTermFraction: number;
}

/**
 * Prices an upgrade.
 *
 * The customer keeps their existing term — `terminatesAt` does not move — so
 * the only money that changes hands today is the difference between the two
 * renewal prices, scaled by how much of the term is still unused.
 *
 * That scale used to be capped at one month, which priced a term of any length
 * as a single month: buying six extensions and then upgrading handed the
 * customer five months of the dearer plan for nothing. The remaining term is
 * now measured for what it is.
 */
export const calculateProRataUpgrade = ({
  currentRenewalPrice,
  newRenewalPrice,
  terminatesAt,
  now = new Date(),
  minimumCharge = MIN_CHARGE_EUR_CENTS,
}: ProRataUpgradeInput): ProRataUpgrade => {
  const remainingMs = terminatesAt
    ? Math.max(0, terminatesAt.getTime() - now.getTime())
    : 0;
  // Lower-bounded only. A lapsed term is worth nothing; a long one is worth
  // every month of it.
  const remainingTermFraction = Math.max(0, remainingMs / MONTH_MS);

  // A cheaper target plan is not a refund; it simply costs nothing today.
  const difference = Math.max(0, newRenewalPrice - currentRenewalPrice);
  const rawAmount = Math.floor(difference * remainingTermFraction);

  return {
    rawAmount,
    amount:
      rawAmount > 0 && rawAmount < minimumCharge ? minimumCharge : rawAmount,
    chargeable: rawAmount > 0,
    remainingTermFraction,
  };
};
