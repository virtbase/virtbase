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

import type { DeclineReasonKey } from "@virtbase/email/templates/decline-reason";
import { declineReasonKey } from "@virtbase/email/templates/decline-reason";

/**
 * What the dashboard is allowed to say about a saved credential.
 *
 * Pure on purpose, and separate from the components: every value that reaches
 * a screen here is derived from the four display fields the API returns, never
 * from anything the provider wrote in free text. `invalid_reason` in
 * particular is stored unclassified - it is the processor's own decline code -
 * so it is classified here into a fixed set of keys and never rendered.
 */

/** The shape these helpers need. A subset of the wire type on purpose. */
export interface PaymentMethodDisplayFields {
  type: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  invalid_at: Date | null;
  invalid_reason: string | null;
}

/**
 * How a credential stands.
 *
 * `expired` is split out from `unusable` because it is the one a customer can
 * fix themselves and the wording differs: an expired card asks for a new one,
 * a revoked one asks them to talk to their bank first.
 */
export type PaymentMethodHealth = "usable" | "expired" | "unusable";

/**
 * Why the provider buried the credential, in the dunning mail's own words.
 *
 * Re-exported from the mail's own table rather than restated here. This file
 * used to carry a second one and the two drifted: the mail deliberately folds
 * `lost_card`, `stolen_card` and `pickup_card` into a plain bank decline - the
 * issuer's guidance is not to tell the person holding the card that it has been
 * reported, because the person holding it is not always the customer - while
 * this screen went ahead and said "reported lost". One table cannot disagree
 * with itself, which is the whole reason it is imported.
 *
 * `declineReasonKey` answers `unknown` for anything it does not recognise, so
 * free text and codes we have never seen still cannot reach a screen.
 */
export type PaymentMethodInvalidReason = DeclineReasonKey;

export const classifyInvalidReason = (
  reason: string | null,
): PaymentMethodInvalidReason => declineReasonKey(reason);

/**
 * Whether the printed expiry date has passed.
 *
 * A card is good through the last day of its expiry month, so the comparison
 * is against the month and not the day. Returns `false` when either half is
 * missing: a SEPA mandate has no expiry, and "we were told nothing" must not
 * read as "expired".
 *
 * **Read in UTC, like every other date decision in the renewal path** -
 * `period.ts`, `claimRenewal`, `acceptMandate`. Local months are how a customer
 * in UTC+13 opening this page at 00:30 on 1 January is refused a card that the
 * collector, thirteen hours behind them in December, would still have charged.
 */
export const hasExpired = (
  {
    exp_month,
    exp_year,
  }: Pick<PaymentMethodDisplayFields, "exp_month" | "exp_year">,
  now: Date,
): boolean => {
  if (!exp_month || !exp_year) return false;

  const year = now.getUTCFullYear();
  if (exp_year !== year) return exp_year < year;

  return exp_month < now.getUTCMonth() + 1;
};

/**
 * `usable`, `expired` or `unusable`.
 *
 * Both sources count. `invalid_at` is what the provider told us when a renewal
 * declined, and it can name a card whose printed date is still in the future -
 * lost, stolen, revoked. The printed date matters on its own because nothing
 * has to fail first for a card to run out: a customer who opens this page in
 * January should be told the card that expired in December is dead, not wait
 * for a renewal to say so.
 */
export const resolvePaymentMethodHealth = (
  method: PaymentMethodDisplayFields,
  now: Date,
): PaymentMethodHealth => {
  if (method.invalid_at) {
    return classifyInvalidReason(method.invalid_reason) === "expiredCard"
      ? "expired"
      : "unusable";
  }

  return hasExpired(method, now) ? "expired" : "usable";
};

/**
 * Whether a renewal could actually be charged, as one word.
 *
 * Declared here rather than beside the switch that reads it because it is the
 * same question `resolvePaymentMethodHealth` answers, asked about the one
 * credential that would pay.
 */
export type PaymentMethodState =
  | "loading"
  /** Attached, chargeable today, and the one that would pay. */
  | "usable"
  /** Nothing on file at all. */
  | "missing"
  /** On file, and it would not go through - dead, or run out. */
  | "unusable";

/**
 * Would a renewal go through on what is on file?
 *
 * The credential that would be charged is the one the subscription names - the
 * server has already resolved "that one, or the account default when it names
 * none" - and whether it would work is `resolvePaymentMethodHealth`, the same
 * call the billing page's list makes about the same row.
 *
 * That shared call is the point. This used to read `invalid_at` alone, so a card
 * whose printed date had simply run out was `usable` here and destructively
 * "Expired" on the billing page: two screens, two answers, and an auto-renewal
 * enrolment on a credential the first collection would decline.
 *
 * `usablePaymentMethodId` in `router/subscriptions.ts` is still the
 * `invalid_at`-only version - it never reads `exp_month`/`exp_year` - so the
 * server will currently accept an enrolment this refuses. That is the safe
 * direction, the page being stricter than the router, and closing it is a
 * change to the router rather than to this.
 */
export const resolvePaymentMethodState = ({
  isPending,
  saved,
  chargeable,
  now,
}: {
  isPending: boolean;
  saved: (PaymentMethodDisplayFields & { id: string })[] | undefined;
  chargeable: { id: string } | null;
  now: Date;
}): PaymentMethodState => {
  if (isPending || !saved) return "loading";
  if (0 === saved.length) return "missing";

  const row = chargeable
    ? saved.find((method) => method.id === chargeable.id)
    : undefined;

  // Something is on file but nothing would be charged: the default is dead or
  // out of date, or there is no default at all. Both need the same page and a
  // different sentence from "add a payment method".
  return row && "usable" === resolvePaymentMethodHealth(row, now)
    ? "usable"
    : "unusable";
};

/**
 * The card networks we are willing to name.
 *
 * `brand` is the provider's string. Mapping it rather than title-casing it
 * keeps arbitrary provider text off the screen, and a brand we do not know
 * simply falls back to the instrument's own label.
 */
const BRAND_NAMES: Record<string, string> = {
  amex: "American Express",
  cartes_bancaires: "Cartes Bancaires",
  diners: "Diners Club",
  discover: "Discover",
  eftpos_au: "Eftpos Australia",
  jcb: "JCB",
  mastercard: "Mastercard",
  unionpay: "UnionPay",
  visa: "Visa",
};

/** The brand's display name, or `null` when it is not one we know. */
export const resolveBrandName = (brand: string | null): string | null =>
  (brand && BRAND_NAMES[brand.toLowerCase()]) || null;

/**
 * `MM / YYYY`, or `null` when the instrument has no expiry.
 *
 * Padded and fixed-format rather than locale-formatted: this is the date
 * printed on the card, and a customer compares it character by character with
 * what they are holding.
 */
export const formatExpiry = ({
  exp_month,
  exp_year,
}: Pick<PaymentMethodDisplayFields, "exp_month" | "exp_year">):
  | string
  | null =>
  exp_month && exp_year
    ? `${String(exp_month).padStart(2, "0")} / ${exp_year}`
    : null;
