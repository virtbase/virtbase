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

import type { SubscriptionStatus } from "@virtbase/db/schema";

/**
 * Which status a subscription may move to next.
 *
 * Declared as data rather than scattered through `if` statements, for the same
 * reasons as `order-status.ts`: a collection result arriving late cannot walk a
 * subscription backwards, and the admin console can render the legal actions
 * without restating the rules.
 *
 * The shape of the machine is `active → past_due → suspended → ended`, with
 * `cancelled` as the branch the customer takes. Every non-terminal state can
 * reach `ended`, because the subject can always go away - a server deleted, a
 * customer offboarded, an abuse case terminated - and a subscription for
 * something that no longer exists has to be closeable from wherever it stood.
 */
const TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  // A collection failed (`past_due`), the customer turned it off
  // (`cancelled`), an operator stopped the service (`suspended`), or the
  // subject went away (`ended`).
  active: ["past_due", "cancelled", "suspended", "ended"],
  // The dunning ladder lives here. `past_due → past_due` is deliberate: a
  // second declined attempt is not a state change, but it is also not an
  // error, and throwing on it would turn an ordinary decline into a page. The
  // attempt count on the renewal row is what actually advances.
  past_due: ["past_due", "active", "suspended", "cancelled", "ended"],
  // The ladder ran out and the server is off. Money can still fix it, which is
  // the whole reason `suspended` is not terminal.
  suspended: ["active", "ended"],
  // Cancelled but still inside the paid-for period, so the customer may
  // change their mind right up until it runs out.
  cancelled: ["active", "ended"],
  // Terminal for every route in. A subject whose subscription has ended can be
  // sold a new one - the live-subject unique index is partial on exactly this
  // state - so nothing needs to leave `ended`.
  ended: [],
} as const;

export const TERMINAL_SUBSCRIPTION_STATUSES = [
  "ended",
] as const satisfies readonly SubscriptionStatus[];

export const isTerminalSubscriptionStatus = (
  status: SubscriptionStatus,
): boolean =>
  (TERMINAL_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(
    status,
  );

export const canTransitionSubscription = (
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean => TRANSITIONS[from].includes(to);

export const nextSubscriptionStatuses = (
  from: SubscriptionStatus,
): readonly SubscriptionStatus[] => TRANSITIONS[from];

/**
 * Statuses a renewal may be claimed from.
 *
 * `active` is the ordinary case; `past_due` is a subscription whose previous
 * period is still being collected for. Nothing else may be charged - a
 * `cancelled` subscription has been told not to renew, and `suspended` and
 * `ended` have no service to bill for.
 */
export const RENEWABLE_SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
] as const satisfies readonly SubscriptionStatus[];

export const isRenewableSubscriptionStatus = (
  status: SubscriptionStatus,
): boolean =>
  (RENEWABLE_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(
    status,
  );

/**
 * Thrown when something asks for a transition the machine does not allow.
 *
 * Loud on purpose, as with orders: a subscription that quietly ends up in a
 * state nobody can explain is one that either bills a customer who cancelled
 * or fails to bill one who did not.
 */
export class IllegalSubscriptionTransitionError extends Error {
  readonly from: SubscriptionStatus;
  readonly to: SubscriptionStatus;

  constructor(from: SubscriptionStatus, to: SubscriptionStatus) {
    super(`A subscription cannot move from "${from}" to "${to}".`);
    this.name = "IllegalSubscriptionTransitionError";
    this.from = from;
    this.to = to;
  }
}

export const assertSubscriptionTransition = (
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void => {
  if (!canTransitionSubscription(from, to)) {
    throw new IllegalSubscriptionTransitionError(from, to);
  }
};
