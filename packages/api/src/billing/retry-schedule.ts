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

import { RENEWAL_RETRY_SCHEDULE_DAYS } from "@virtbase/utils";

/**
 * The dunning ladder, as arithmetic.
 *
 * The schedule itself lives in `@virtbase/utils` next to
 * `SERVER_DELETION_GRACE_PERIOD_DAYS`, because how long a customer is given to
 * fix a card before their server goes is a business decision and not a
 * property of this module. What is here is only how that schedule is walked.
 *
 * Pure and free of database access, so the date a dunning email quotes and the
 * date the retry sweep acts on come from one place.
 */

/** How many retries the ladder has after the attempt that found the period due. */
export const RENEWAL_LADDER_RUNGS = RENEWAL_RETRY_SCHEDULE_DAYS.length;

/**
 * How long after the period fell due the ladder runs out, in days.
 *
 * The last rung's own offset, and therefore the day the customer actually
 * loses the machine. The schedule is declared as offsets from the first
 * decline, the first decline happens when the period falls due - which is
 * `subscription_renewals.period_start`, `servers.terminates_at` to the second
 * - and a decline on the last rung leaves `attempt` past the end of the
 * schedule, so `nextRenewalAttemptAt` returns null, the renewal is abandoned
 * and the subscription is suspended. A suspended subscription no longer
 * matches the exemption in `/api/cron/suspend-terminated-servers`, which runs
 * every fifteen minutes.
 *
 * **[!] This is not `RENEWAL_SUSPENSION_GRACE_DAYS`, and nothing a customer is
 * told may be computed from that one.** The grace constant is deliberately one
 * day *more* than this (`max(RENEWAL_RETRY_SCHEDULE_DAYS) + 1`) and answers a
 * different question: it is the backstop that keeps a renewal system which has
 * stopped running from handing out unbounded free service, for a subscription
 * that is *still* `active`/`past_due`. A dunned customer is never in that
 * state on the last day of it - the ladder has already moved them to
 * `suspended` a day earlier - so quoting it in a dunning email promises them a
 * day they do not have and takes the server away while they still believe they
 * can fix their card.
 */
export const RENEWAL_LADDER_EXHAUSTED_AFTER_DAYS = Math.max(
  ...RENEWAL_RETRY_SCHEDULE_DAYS,
);

/**
 * How long to wait after the `attempt`-th decline, in days. `null` once the
 * ladder is out of rungs.
 *
 * `attempt` counts declines, so it is 1 on the first one. The schedule is
 * declared as offsets from the first decline - +1d, +3d, +5d, +7d - and this
 * returns the *gap* to the next one, which is what a worker running now can
 * act on. The two agree exactly as long as each retry runs roughly on time,
 * and a retry that runs late shifts the remainder later rather than
 * compressing the ladder into an afternoon. Anchoring on a stored first-failure
 * timestamp instead would do the opposite: a subscription that fell due while
 * collection was switched off would burn every rung in four consecutive sweeps
 * and suspend a customer within the hour.
 */
export const renewalRetryDelayDays = (attempt: number): number | null => {
  if (attempt < 1) {
    throw new RangeError(
      `A retry is only scheduled after a decline, so attempt must be at least 1, got ${attempt}.`,
    );
  }

  const offset = RENEWAL_RETRY_SCHEDULE_DAYS[attempt - 1];
  if (offset === undefined) return null;

  const previous =
    attempt >= 2 ? (RENEWAL_RETRY_SCHEDULE_DAYS[attempt - 2] ?? 0) : 0;

  return offset - previous;
};

/**
 * When the `attempt`-th decline should be retried, or `null` when the ladder
 * is exhausted and the subscription is to be suspended instead.
 */
export const nextRenewalAttemptAt = (
  attempt: number,
  from: Date = new Date(),
): Date | null => {
  const days = renewalRetryDelayDays(attempt);
  if (days === null) return null;

  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
};

/** Whether a renewal that has declined `attempt` times has any rungs left. */
export const isRenewalLadderExhausted = (attempt: number): boolean =>
  attempt >= 1 && renewalRetryDelayDays(attempt) === null;

/**
 * The attempt count that means "the ladder is spent" without having climbed it.
 *
 * A decline the provider says can never come good - a card reported stolen, an
 * account that does not exist - must not be presented four more times over a
 * week. Jumping the count past the last rung records that those attempts will
 * not happen, and leaves a row that reads as out of rungs to anything looking
 * at it later.
 */
export const exhaustedRenewalAttempt = (attempt: number): number =>
  Math.max(attempt + 1, RENEWAL_LADDER_RUNGS + 1);
