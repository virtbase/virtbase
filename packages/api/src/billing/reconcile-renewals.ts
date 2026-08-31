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

import * as Sentry from "@sentry/node";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lte,
  notExists,
  sql,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { payments, subscriptionRenewals } from "@virtbase/db/schema";
import type { Payment } from "@virtbase/ports";
import { RENEWAL_AUTHENTICATION_WINDOW_HOURS } from "@virtbase/utils";
import { applyPaymentEvent } from "../orders/apply-payment-event";
import { fulfilOrder } from "../orders/fulfill-order";
import type { OrderBillingAddress } from "../orders/record-billing-details";
import { requirePaymentCapability } from "../payment-methods/provider";
import {
  markRenewalCollecting,
  recordCollectionResult,
} from "./record-outcome";

/**
 * How long a renewal may sit in `collecting` before the worker holding it is
 * treated as gone.
 *
 * `collecting` is written immediately before the provider is called and moved
 * on the moment it answers, so a row that has sat in it for ten minutes is a
 * crashed process rather than a slow one - the same reasoning, and the same
 * number, as `ORDER_FULFILMENT_GRACE_MINUTES`. Short enough that a customer
 * who has paid is not left waiting; long enough that a Stripe call having a
 * bad minute is not reconciled out from under itself.
 *
 * Operational rather than a business decision, so it lives here rather than in
 * `@virtbase/utils` beside the dunning ladder.
 */
export const RENEWAL_COLLECTION_GRACE_MINUTES = 10;

/**
 * The maximum number of renewals of *each* kind examined per run.
 *
 * Each one may cost a provider round trip and a workflow enqueue, so this is
 * what bounds the route. Anything left over is found ten minutes later, still
 * oldest first.
 */
export const RECONCILE_RENEWALS_BATCH_SIZE = 100;

/**
 * How long an answer of "still moving" is taken at its word before the
 * provider is asked again.
 *
 * **This is what stops the `collecting` batch starving itself.** That batch is
 * the hundred oldest stranded rows by `updated_at`, and a renewal the provider
 * reports as `processing` is left exactly where it is - correctly, because a
 * SEPA debit takes days. But nothing about it moves, so it keeps its place at
 * the head of the queue and is asked the same question every ten minutes for
 * the whole of those days. A hundred of them and the batch never contains
 * anything else: the genuinely stranded row from a crashed worker, the one row
 * in this table that nobody else will ever look at and that this sweep exists
 * to rescue, is never examined at all, and a customer whose card was charged
 * never gets their server extended.
 *
 * So a renewal whose own attempt already has a payment row we recorded as
 * `processing` is skipped while that row is fresh. The answer is already in
 * our database; asking for it again ten minutes later cannot produce a
 * different one, and the batch fills with rows that might actually need
 * something instead. Six hours later it is asked again, which is soon enough
 * for a settlement whose webhook was lost on something that takes days to
 * settle, and rare enough that a few thousand debits in flight cannot crowd
 * the sweep out.
 */
export const RENEWAL_IN_FLIGHT_RECHECK_HOURS = 6;

/** The failure code recorded when the customer never authenticated. */
export const AUTHENTICATION_EXPIRED_CODE = "authentication_expired";

/** The failure code recorded when the provider reports a charge as failed. */
export const PROVIDER_REPORTED_FAILURE_CODE = "provider_reported_failure";

/** What is known about a customer before any address has been recorded. */
const EMPTY_BILLING_DETAILS: OrderBillingAddress = {
  name: null,
  email: null,
  address: {
    line1: null,
    line2: null,
    city: null,
    postal_code: null,
    country: null,
  },
};

/** The payment row an unsettled renewal is reconciled against. */
interface RenewalPayment {
  id: string;
  provider: string;
  externalId: string;
  userId: string;
  orderId: string | null;
  amount: number;
  currency: string;
}

/** Injected in tests, so reconciliation can be exercised without a provider. */
export type RenewalPaymentResolver = (
  payment: RenewalPayment,
) => Promise<Payment>;

/** Injected in tests, and the reason a renewal invoice has an address at all. */
export type RenewalBillingResolver = (
  payment: RenewalPayment,
) => Promise<OrderBillingAddress>;

export interface ReconcileRenewalsOptions {
  limit?: number;
  graceMinutes?: number;
  retrievePayment?: RenewalPaymentResolver;
  resolveBillingDetails?: RenewalBillingResolver;
}

export interface ReconcileRenewalsResult {
  /** Renewals that looked stranded. */
  examined: number;
  /** Charges the provider confirmed, now settled through the ordinary path. */
  settled: number;
  /** Attempts the provider reported as failed, now on the dunning ladder. */
  declined: number;
  /** Attempts handed back to the retry sweep. */
  rescheduled: number;
  /** Charges parked waiting on the customer to authenticate. */
  awaitingAction: number;
  /** Still genuinely in flight at the provider. Left for the next run. */
  inFlight: number;
  /** Renewals that threw. Each is reported to Sentry. */
  failed: number;
}

/** Asks the provider what became of a payment we have already recorded. */
const askTheProvider: RenewalPaymentResolver = async (payment) => {
  const retrieve = await requirePaymentCapability(
    payment.provider,
    "retrievePayment",
  );

  return retrieve(payment.externalId);
};

/**
 * Where a settled renewal's billing address comes from.
 *
 * The same answer `reconcileOrders` reaches by the same route: the order has
 * none of its own until `fulfilOrder` records one, so a Stripe payment is
 * asked about directly. Better an invoice with no address than a customer who
 * paid and got nothing - the address is recoverable afterwards, the extension
 * is not.
 */
const readBillingDetails: RenewalBillingResolver = async (payment) => {
  if (payment.provider !== "stripe") return EMPTY_BILLING_DETAILS;

  const { readStripeBillingDetails } = await import(
    "../orders/settle-stripe-payment"
  );

  return readStripeBillingDetails(payment.externalId);
};

/**
 * The payment recorded for a renewal's order, newest first.
 *
 * **`since` is what keeps an answer about one attempt from being read as an
 * answer about another.** A renewal keeps its order for the whole dunning
 * ladder, so `payments` accumulates one row per attempt that reached the
 * provider - and the newest of them belongs to the attempt being reconciled
 * only if it was written after that attempt was claimed. Passing the claim
 * instant is how a caller says "the payment for *this* attempt, or none",
 * which is the only question a decline may be decided from.
 *
 * `>=` and not `>`: `recordCollectionResult` writes the payment row and the
 * renewal row in one transaction, so a submitted charge shares `now()` with
 * the `updated_at` it is being compared against, to the microsecond.
 */
const paymentFor = async (
  orderId: string | null,
  since?: Date,
): Promise<RenewalPayment | null> => {
  if (!orderId) return null;

  const belongsToTheOrder = eq(payments.orderId, orderId);

  return (
    (await db
      .select({
        id: payments.id,
        provider: payments.provider,
        externalId: payments.externalId,
        userId: payments.userId,
        orderId: payments.orderId,
        amount: payments.amount,
        currency: payments.currency,
      })
      .from(payments)
      .where(
        since
          ? and(belongsToTheOrder, gte(payments.createdAt, since))
          : belongsToTheOrder,
      )
      .orderBy(desc(payments.createdAt))
      .limit(1)
      .then(([row]) => row)) ?? null
  );
};

/**
 * Settles a charge the provider says succeeded, through the ordinary path.
 *
 * Nothing here writes the renewal or the term. `applyPaymentEvent` records the
 * payment and moves the order, `fulfilOrder` starts the extension workflow, and
 * `storeServerExtensionStep` is what settles the renewal row and returns the
 * subscription to `active` - exactly as it does when the webhook arrives on
 * time. Reconciliation's whole job is to supply the event that went missing,
 * not to duplicate what the event would have caused.
 *
 * The event id is synthesised from the payment rather than the clock, so a
 * reconciliation that runs twice claims `(provider, event_id)` once and the
 * second run short-circuits inside `applyPaymentEvent` like any redelivery.
 */
const settleFromProvider = async (
  payment: RenewalPayment,
  answer: Payment,
  resolveBillingDetails: RenewalBillingResolver,
): Promise<void> => {
  if (!payment.orderId) {
    throw new Error(
      `Payment ${payment.externalId} has no order; a renewal cannot be settled from it.`,
    );
  }

  const applied = await applyPaymentEvent({
    eventId: `reconcile:${payment.provider}:${payment.externalId}`,
    provider: payment.provider,
    type: "payment.succeeded",
    externalId: payment.externalId,
    orderId: payment.orderId,
    userId: payment.userId,
    amount: answer.total.amount,
    currency: answer.total.currency,
    method: answer.method,
  });

  if (!applied.shouldFulfil) return;

  await fulfilOrder({
    orderId: payment.orderId,
    billingDetails: await resolveBillingDetails(payment),
  });
};

/**
 * Finishes every renewal whose attempt was left hanging.
 *
 * Three things can strand one, and all three are the same shape as the
 * stranded orders `reconcileOrders` picks up - a process that went away
 * between one durable write and the next, with nothing else in the system that
 * would ever look at the row again:
 *
 * - **`collecting` past the grace period.** The charge was submitted and the
 *   answer never came back, or the worker died before it could write one down.
 *   The provider is asked directly *about the payment this attempt recorded* -
 *   never about an earlier rung's, which is a different charge with a different
 *   answer; a charge it confirms is settled through the ordinary path, one it
 *   reports as failed goes onto the dunning ladder, one it is holding open for
 *   the customer is parked in `awaiting_action`, and one it is still working on
 *   is left alone. An attempt that recorded nothing at all is handed back to
 *   the retry sweep under the same idempotency key rather than judged.
 * - **`awaiting_action` past its deadline.** The customer never authenticated.
 *   The provider is asked first - a completed authentication whose webhook was
 *   lost must settle rather than cost the customer a rung - then the intent is
 *   **cancelled**, and only then does the renewal fall back into the ladder.
 * - **`pending` with no `next_attempt_at`.** A claim whose worker vanished
 *   before it could take the attempt. Nothing here charges it: it is handed to
 *   the retry sweep, which is the only path that starts a charge.
 *
 * Every branch either settles the renewal, moves it somewhere something else
 * owns it, or leaves it for the next run - and no branch may leave a row in
 * `collecting` indefinitely, because a batch of those is a batch in which
 * nothing new is ever examined. Every write is guarded on the row being
 * exactly as it was read: a late webhook or a second reconciliation may have
 * taken it on legitimately, and `updated_at` moving is how that shows.
 */
export const reconcileRenewals = async ({
  limit = RECONCILE_RENEWALS_BATCH_SIZE,
  graceMinutes = RENEWAL_COLLECTION_GRACE_MINUTES,
  retrievePayment = askTheProvider,
  resolveBillingDetails = readBillingDetails,
}: ReconcileRenewalsOptions = {}): Promise<ReconcileRenewalsResult> => {
  const grace = Math.max(0, Math.floor(graceMinutes));
  const staleBefore = sql`now() - INTERVAL '${sql.raw(`${grace}`)} minutes'`;

  const result: ReconcileRenewalsResult = {
    examined: 0,
    settled: 0,
    declined: 0,
    rescheduled: 0,
    awaitingAction: 0,
    inFlight: 0,
    failed: 0,
  };

  const columns = {
    id: subscriptionRenewals.id,
    subscriptionId: subscriptionRenewals.subscriptionId,
    orderId: subscriptionRenewals.orderId,
    updatedAt: subscriptionRenewals.updatedAt,
  };

  // Matches the partial index on `(updated_at) WHERE status = 'collecting'`;
  // the anti-join adds no term to `subscription_renewals` itself, so the index
  // still drives the scan and the ordering, and `payments`' own index on
  // `order_id` answers each probe. See `RENEWAL_IN_FLIGHT_RECHECK_HOURS` for
  // why the probe is there at all.
  const collecting = await db
    .select(columns)
    .from(subscriptionRenewals)
    .where(
      and(
        eq(subscriptionRenewals.status, "collecting"),
        lte(subscriptionRenewals.updatedAt, staleBefore),
        notExists(
          db
            .select({ one: sql`1` })
            .from(payments)
            .where(
              and(
                eq(payments.orderId, subscriptionRenewals.orderId),
                eq(payments.status, "processing"),
                // Scoped to *this* attempt, exactly as `paymentFor` is: an
                // earlier rung's payment says nothing about this charge.
                gte(payments.createdAt, subscriptionRenewals.updatedAt),
                gte(
                  payments.createdAt,
                  sql`now() - INTERVAL '${sql.raw(`${RENEWAL_IN_FLIGHT_RECHECK_HOURS}`)} hours'`,
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(subscriptionRenewals.updatedAt))
    .limit(limit);

  // Matches the partial index on
  // `(next_attempt_at) WHERE status IN ('pending', 'awaiting_action')`.
  const awaitingAction = await db
    .select(columns)
    .from(subscriptionRenewals)
    .where(
      and(
        eq(subscriptionRenewals.status, "awaiting_action"),
        lte(subscriptionRenewals.nextAttemptAt, sql`now()`),
      ),
    )
    .orderBy(asc(subscriptionRenewals.nextAttemptAt))
    .limit(limit);

  const unscheduled = await db
    .select(columns)
    .from(subscriptionRenewals)
    .where(
      and(
        eq(subscriptionRenewals.status, "pending"),
        isNull(subscriptionRenewals.nextAttemptAt),
        lte(subscriptionRenewals.updatedAt, staleBefore),
      ),
    )
    .orderBy(asc(subscriptionRenewals.updatedAt))
    .limit(limit);

  result.examined =
    collecting.length + awaitingAction.length + unscheduled.length;

  // Sequential on purpose, as in `reconcileOrders`: each of these may reach a
  // payment provider and enqueue workflows, and one bad renewal must not end
  // the sweep.
  for (const renewal of collecting) {
    try {
      // [!] Scoped to the attempt in flight, never merely to the order.
      //
      // `updated_at` on a `collecting` row is the instant `markRenewalCollecting`
      // took this attempt - nothing else writes the row while it sits in that
      // status - so a payment written before it belongs to an earlier rung of
      // the ladder and says nothing about this one. Asking the provider about
      // that row instead would judge attempt N by attempt N-1's decline: a rung
      // spent, a "your renewal was declined" mail sent, and a server eventually
      // suspended, while the intent this attempt actually submitted may have
      // succeeded and taken the money.
      const payment = await paymentFor(renewal.orderId, renewal.updatedAt);

      if (!payment) {
        // Nothing durable was written about *this* attempt: either the worker
        // died before it could record anything, or it recorded the previous
        // rung's decline and nothing since. Both are the same situation - the
        // outcome of the charge this attempt submitted is unknown, and the
        // database cannot supply it.
        //
        // Released back to `pending` under a guard and handed to the retry
        // sweep, which is the path that may start a charge. **The attempt count
        // is deliberately untouched**, so the retry presents the same
        // idempotency key - `renewal:<id>:<attempt>` - and the provider answers
        // with the charge it already made under that key rather than making a
        // second one. That is what turns "we do not know" into a fact instead
        // of a guess, and it is why this branch can never double-charge.
        const released = await db
          .update(subscriptionRenewals)
          .set({ status: "pending", nextAttemptAt: sql`now()` })
          .where(
            and(
              eq(subscriptionRenewals.id, renewal.id),
              eq(subscriptionRenewals.status, "collecting"),
              // Somebody else may have taken this on legitimately between the
              // select above and here; `updated_at` moving is how that shows.
              eq(subscriptionRenewals.updatedAt, renewal.updatedAt),
            ),
          )
          .returning({ id: subscriptionRenewals.id })
          .then(([row]) => row);

        if (released) result.rescheduled++;
        continue;
      }

      const answer = await retrievePayment(payment);

      if (answer.status === "succeeded") {
        await settleFromProvider(payment, answer, resolveBillingDetails);
        result.settled++;
        continue;
      }

      if (answer.status === "failed" || answer.status === "cancelled") {
        // A decline whose webhook never arrived. Fed through the same recorder
        // the live path uses, so it spends a rung and schedules the next one
        // exactly as an ordinary decline would - and refuses to write anything
        // if the row has moved on since it was read.
        const recorded = await recordCollectionResult(renewal.id, {
          result: {
            status: "failed",
            externalId: payment.externalId,
            code: PROVIDER_REPORTED_FAILURE_CODE,
            // Nothing here knows the issuer's own code - `retrievePayment`
            // reports a status and not a decline reason - and guessing
            // terminal would cancel a customer over a charge that may well
            // have been a timeout at the issuer.
            retryable: true,
            message: `${payment.provider} reports payment ${payment.externalId} as ${answer.status}.`,
          },
          // The payment row already exists; there is no credential to mark and
          // nothing to insert.
          paymentMethod: null,
          idempotencyKey: null,
        });

        if (recorded.outcome === "superseded") continue;
        result.declined++;
        continue;
      }

      if (answer.status === "pending") {
        // The provider is holding the payment open rather than working on it,
        // and the worker that submitted it died before it could write that
        // down. This is **not** in flight in any useful sense: nothing at the
        // provider is going to settle it, no webhook is coming, and left
        // `collecting` it is re-examined on every run for the life of the
        // table while the money it is waiting for never arrives - the one
        // shape of stranded row that accumulates without bound and crowds
        // every other out of the batch.
        //
        // Parked exactly as `recordCollectionResult` would have parked it, so
        // the `awaiting_action` branch below owns it from here: it asks the
        // provider again, cancels the intent when the window closes, and
        // spends the rung there rather than here. **The attempt is untouched**
        // - being asked to authenticate is not a decline.
        //
        // The deadline is measured from the claim rather than from now,
        // because that is when the intent was created and when the customer's
        // 72 hours really started. A row stranded for longer than that is
        // already past its deadline and the next run finishes it.
        //
        // `PaymentStatus` cannot separate "waiting on the customer" from "the
        // intent fell back to needing a payment method", and this takes the
        // first reading on purpose: an intent that may still be confirmable
        // must not be abandoned behind the customer's back. Either way it is
        // cancelled before a rung is spent, so the reading costs at most a
        // delay.
        const parked = await db
          .update(subscriptionRenewals)
          .set({
            status: "awaiting_action",
            nextAttemptAt: new Date(
              renewal.updatedAt.getTime() +
                RENEWAL_AUTHENTICATION_WINDOW_HOURS * 60 * 60 * 1000,
            ),
          })
          .where(
            and(
              eq(subscriptionRenewals.id, renewal.id),
              eq(subscriptionRenewals.status, "collecting"),
              eq(subscriptionRenewals.updatedAt, renewal.updatedAt),
            ),
          )
          .returning({ id: subscriptionRenewals.id })
          .then(([row]) => row);

        if (parked) result.awaitingAction++;
        continue;
      }

      // `processing`: genuinely in flight. A SEPA debit takes days, so this is
      // an ordinary answer and not a fault - it is left `collecting`. It is
      // also not asked about again for `RENEWAL_IN_FLIGHT_RECHECK_HOURS`,
      // which is what keeps a few days of debits from filling every batch.
      result.inFlight++;
    } catch (error) {
      result.failed++;
      console.error(
        `[renewals] Reconciling collecting renewal ${renewal.id} threw.`,
        error,
      );
      Sentry.captureException(error);
    }
  }

  for (const renewal of awaitingAction) {
    try {
      // Unscoped on purpose, unlike the branch above. A row only reaches
      // `awaiting_action` through `recordCollectionResult`, which writes the
      // intent's payment row in the very transaction that puts it there, so the
      // newest payment for the order *is* this attempt's - and the row's
      // `updated_at` is that same instant rather than a later claim to measure
      // against.
      const payment = await paymentFor(renewal.orderId);

      if (payment) {
        const answer = await retrievePayment(payment);

        if (answer.status === "succeeded") {
          // The customer did authenticate and the webhook was lost. Settling
          // costs them nothing; failing them into the ladder would have cost
          // them a rung and a dunning email for something they did.
          await settleFromProvider(payment, answer, resolveBillingDetails);
          result.settled++;
          continue;
        }

        if (answer.status === "processing") {
          result.inFlight++;
          continue;
        }
      }

      // ── The window has run out with nothing to show for it. ──────────────
      //
      // [!] The intent has to be withdrawn *before* the rung is spent.
      //
      // It is still live and still confirmable: the link sits in the
      // customer's banking app and works until the provider expires it.
      // Spending a rung schedules another attempt, that attempt builds a new
      // idempotency key - the key carries the attempt, and authentication does
      // not spend one, so the rung is exactly what changes it - and the
      // provider mints a *second* intent for the same month. The customer taps
      // the original on day four and is billed twice.
      //
      // `router/subscriptions.ts` refuses a manual retry of an
      // `awaiting_action` renewal for precisely this reason. The automatic
      // path must not do by itself what the manual one is forbidden to do.
      if (payment) {
        try {
          const cancel = await requirePaymentCapability(
            payment.provider,
            "cancelPayment",
          );

          await cancel(payment.externalId);
        } catch (error) {
          // Not cancelled means not safe to continue. **No rung is spent and
          // no second intent is created**; the row is left exactly as it was
          // and the next run tries again. If the reason the cancel failed is
          // that the customer authenticated after all, that run reads
          // `succeeded` above and settles it - which is the outcome the
          // customer deserves and the one this ordering preserves.
          result.failed++;
          console.error(
            `[renewals] Could not cancel ${payment.provider} payment ${payment.externalId} for renewal ${renewal.id}; the rung is not spent.`,
            error,
          );
          Sentry.captureException(error);
          continue;
        }
      }

      // Taken as an attempt - which is the guard, since only one worker can
      // move a row out of `awaiting_action` - and then recorded as a decline.
      const taken = await markRenewalCollecting(renewal.id);
      if (!taken) continue;

      const recorded = await recordCollectionResult(renewal.id, {
        result: {
          status: "failed",
          ...(payment ? { externalId: payment.externalId } : {}),
          code: AUTHENTICATION_EXPIRED_CODE,
          retryable: true,
          message:
            "The customer did not complete authentication before the window closed.",
        },
        paymentMethod: null,
        idempotencyKey: null,
      });

      if (recorded.outcome !== "superseded") result.declined++;
    } catch (error) {
      result.failed++;
      console.error(
        `[renewals] Reconciling awaiting_action renewal ${renewal.id} threw.`,
        error,
      );
      Sentry.captureException(error);
    }
  }

  for (const renewal of unscheduled) {
    try {
      // Scheduled, never charged. Reconciliation deliberately starts no
      // charges of its own - it settles ones that already exist - so this only
      // makes the row visible to the retry sweep, which is the single path
      // that may present a credential to a provider. Keeping that to one place
      // is what makes "what can take a customer's money" a question with one
      // answer.
      const scheduled = await db
        .update(subscriptionRenewals)
        .set({ nextAttemptAt: sql`now()` })
        .where(
          and(
            eq(subscriptionRenewals.id, renewal.id),
            eq(subscriptionRenewals.status, "pending"),
            isNull(subscriptionRenewals.nextAttemptAt),
            eq(subscriptionRenewals.updatedAt, renewal.updatedAt),
          ),
        )
        .returning({ id: subscriptionRenewals.id })
        .then(([row]) => row);

      if (scheduled) result.rescheduled++;
    } catch (error) {
      result.failed++;
      console.error(
        `[renewals] Rescheduling unclaimed renewal ${renewal.id} threw.`,
        error,
      );
      Sentry.captureException(error);
    }
  }

  return result;
};
