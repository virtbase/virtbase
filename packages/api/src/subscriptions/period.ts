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
 * When a billing period ends.
 *
 * Pure and free of database access, so the date a customer is told and the
 * date they are charged on come from one place.
 *
 * **This is not `lib/pricing.ts`'s month.** That module bills a pro-rata
 * upgrade against a flat 30 days on purpose: an upgrade charge has to be
 * stable regardless of which calendar month it lands in, and it has no term
 * start to anchor on. A billing *period* is the opposite problem - it is
 * anchored, it must land on the customer's own day of the month, and it must
 * agree with what the invoice says. Reusing the flat month here would move
 * every renewal five or six days earlier per year. The two stay separate.
 *
 * Everything below works in UTC, because every timestamp involved is
 * `timestamptz` and the customer's local calendar is a presentation concern.
 * Doing the arithmetic in local time would shift a period by an hour twice a
 * year and, for a period ending at midnight, by a whole day.
 */

/** The largest day of month any anchor can take. */
export const MAX_BILLING_ANCHOR_DAY = 31;

/** Days in a UTC month. Day 0 of the next month is the last day of this one. */
const daysInUtcMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * The day of the month a subscription bills on.
 *
 * The anchor is what stops a subscription drifting. A period computed by
 * adding a month to the *previous, clamped* value walks backwards through the
 * calendar - 31 Jan becomes 28 Feb becomes 28 Mar - and a customer anchored on
 * the 31st is silently moved to the 28th forever after their first February.
 * Postgres' own `+ INTERVAL '1 month'`, which `store-server-extension.ts` uses
 * to push `servers.terminates_at`, has exactly this behaviour.
 *
 * There is no `billing_anchor_day` column to read, so it is recovered from the
 * period the subscription is currently in: **clamping only ever moves a date
 * earlier in the month, never later**, so the larger of the two endpoints'
 * days is the one closer to the original anchor. A subscription anchored on
 * the 31st and sitting in `28 Feb → 31 Mar` reports 31, and the next period
 * lands on 30 Apr rather than 28 Apr.
 *
 * The one case it cannot recover is an anchor of 31 on an interval long enough
 * that *both* endpoints fall in short months - `30 Apr → 30 Jun` at
 * `intervalMonths: 2` - which then settles on the 30th for good. A stored
 * anchor column is the real fix and is the obvious next schema change; this
 * recovery exists because the schema is not mine to extend here, and because
 * it also repairs rows written before this module existed.
 */
export const billingAnchorDay = (period: {
  currentPeriodStart: Date;
  currentPeriodEnd?: Date | null;
}): number =>
  Math.max(
    period.currentPeriodStart.getUTCDate(),
    period.currentPeriodEnd?.getUTCDate() ?? 0,
  );

/**
 * The end of the period that starts at `from`.
 *
 * Adds `intervalMonths` calendar months and lands on `anchorDay`, clamped to
 * the length of the target month: 31 Jan + 1 month is 28 Feb, or 29 Feb in a
 * leap year, and 30 Jan + 1 month is 28 Feb as well. The time of day is
 * carried across untouched, so a subscription that renews at 09:14:03 UTC
 * keeps renewing at 09:14:03 UTC.
 *
 * `anchorDay` defaults to `from`'s own day, which is correct for a period that
 * has never been clamped - a fresh subscription, or any date in a 31-day
 * month. Callers that hold a subscription row should pass
 * {@link billingAnchorDay} instead, or the clamp becomes permanent. See the
 * note there.
 */
export const nextPeriodEnd = (
  from: Date,
  intervalMonths: number,
  anchorDay: number = from.getUTCDate(),
): Date => {
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1) {
    // A zero or negative interval would produce a period that ends before it
    // begins, which the `subscriptions_period_range` check constraint rejects
    // at the far end of a long call chain. Fail here, where the caller is.
    throw new RangeError(
      `intervalMonths must be a positive whole number, got ${intervalMonths}.`,
    );
  }

  if (Number.isNaN(from.getTime())) {
    throw new RangeError("from must be a valid date.");
  }

  const absoluteMonth = from.getUTCMonth() + intervalMonths;
  const year = from.getUTCFullYear() + Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;

  const day = Math.min(
    Math.max(1, Math.min(anchorDay, MAX_BILLING_ANCHOR_DAY)),
    daysInUtcMonth(year, month),
  );

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
};
