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

import { db } from "@virtbase/db/client";
import type { Subscription } from "@virtbase/db/schema";
import { subscriptions } from "@virtbase/db/schema";
import { nextPeriodEnd } from "./period";
// The exported helper rather than a local one. A second `findLiveSubscription`
// in this directory - with its two subject arguments the other way round, as
// the one that used to live here had - is a copy-paste trap: called backwards
// it looks for a subscription whose `subject_type` is a server id, matches
// nothing, and opens a duplicate subscription instead of adopting the existing
// one.
import { findLiveSubscription } from "./subject-subscription";

export interface CreateSubscriptionInput {
  userId: string;
  /** A `servers.id` while `subjectType` is `server`. */
  subjectId: string;
  subjectType?: string;
  /** The price row every renewal is quoted from. */
  serverPlanPriceId: string;
  /** When the paid-for period the customer already has began. */
  currentPeriodStart: Date;
  /**
   * When it runs out. Defaults to one interval after the start, which is what
   * a freshly provisioned server wants; an extension that already moved
   * `terminates_at` should pass that value so the two agree.
   */
  currentPeriodEnd?: Date;
  intervalMonths?: number;
  currency?: string;
  autoRenew?: boolean;
  paymentMethodId?: string | null;
  /** When the customer agreed we may charge them while they are not present. */
  mandateAcceptedAt?: Date | null;
  /** Which wording they accepted, e.g. `2026-08-01`. */
  mandateTextVersion?: string | null;
}

/**
 * Starts a subscription for something that was just provisioned or extended.
 *
 * **Safe to call twice.** Provisioning is a durable workflow: a step that
 * succeeded and then failed to report is replayed, and every caller of this
 * function is therefore an at-least-once caller. The database already refuses
 * the duplicate - `subscriptions_subject_live_index` is unique on
 * `(subject_type, subject_id)` where the subscription has not ended - so the
 * only question is what this function does about it, and throwing would fail a
 * workflow whose work was in fact already done.
 *
 * Two subscriptions against one server would bill the customer twice a month,
 * each unaware of the other and each pushing `terminates_at` out on top of the
 * other's extension, so the constraint stays the authority. The pre-read below
 * is only an optimisation for the ordinary replay; the catch is what handles
 * two callers racing, because between a read and an insert there is always a
 * window.
 */
export const createSubscription = async ({
  userId,
  subjectId,
  subjectType = "server",
  serverPlanPriceId,
  currentPeriodStart,
  currentPeriodEnd,
  intervalMonths = 1,
  currency = "EUR",
  autoRenew = true,
  paymentMethodId = null,
  mandateAcceptedAt = null,
  mandateTextVersion = null,
}: CreateSubscriptionInput): Promise<Subscription> => {
  const existing = await findLiveSubscription(db, subjectId, subjectType);
  if (existing) return existing;

  const periodEnd =
    currentPeriodEnd ?? nextPeriodEnd(currentPeriodStart, intervalMonths);

  try {
    const created = await db
      .insert(subscriptions)
      .values({
        userId,
        subjectType,
        subjectId,
        serverPlanPriceId,
        intervalMonths,
        currency,
        currentPeriodStart,
        currentPeriodEnd: periodEnd,
        autoRenew,
        paymentMethodId,
        mandateAcceptedAt,
        mandateTextVersion,
      })
      .returning()
      .then(([row]) => row);

    if (!created) {
      throw new Error(
        `Failed to create subscription for ${subjectType} ${subjectId}.`,
      );
    }

    return created;
  } catch (error) {
    // The unique index fired, which means somebody else created the
    // subscription between the read above and this insert. Re-read rather
    // than inspecting the driver's error code: `23505` is not surfaced
    // identically by every driver this package runs against (Neon in
    // production, PGlite under test), and "is there a live subscription for
    // this subject" is the question the caller actually has.
    const raced = await findLiveSubscription(db, subjectId, subjectType);
    if (raced) return raced;

    throw error;
  }
};
