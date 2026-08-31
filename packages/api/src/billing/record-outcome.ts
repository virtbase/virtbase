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
import { and, desc, eq, inArray, isNull, sql } from "@virtbase/db";
import type { Transaction } from "@virtbase/db/client";
import { db } from "@virtbase/db/client";
import type { SubscriptionRenewal } from "@virtbase/db/schema";
import {
  paymentMethods,
  payments,
  subscriptionRenewals,
  subscriptions,
} from "@virtbase/db/schema";
import type { OffSessionResult, PaymentStatus } from "@virtbase/ports";
import { RENEWAL_AUTHENTICATION_WINDOW_HOURS } from "@virtbase/utils";
import { transitionSubscription } from "../subscriptions/transition-subscription";
import type { RenewalCollection, RenewalPaymentMethod } from "./collect";
import { notifyRenewalDecline } from "./dunning-mail";
import type { RenewalOutcome } from "./renewal-outcome";
import {
  exhaustedRenewalAttempt,
  nextRenewalAttemptAt,
} from "./retry-schedule";

/** Who the transition log names when a collection moves a subscription. */
const COLLECTOR_ACTOR = "system:renewals";

/**
 * How long a renewal waits before a provider that could not be reached is
 * tried again.
 *
 * Short, because nothing about the customer is wrong and the only cost of
 * asking again is one API call; long enough that a provider having a bad ten
 * minutes is not hammered by every sweep in the meantime. It is not a rung and
 * it does not compound: without a column counting transport failures there is
 * nothing to compound *on*, and inventing one out of `updated_at` would turn a
 * long outage into a silently growing delay nobody could explain afterwards.
 *
 * It does not run for ever either. See
 * {@link RENEWAL_TRANSPORT_ESCALATION_HOURS}, which bounds the patience on
 * elapsed silence rather than on a count for the same reason: the elapsed time
 * is recoverable from rows that already exist, and a count is not.
 *
 * This is an operational limit rather than a business decision, so it lives
 * here rather than in `@virtbase/utils` beside the ladder itself - the same
 * split `ORDER_FULFILMENT_GRACE_MINUTES` makes in `reconcile-orders.ts`.
 */
export const RENEWAL_TRANSPORT_BACKOFF_MINUTES = 15;

/**
 * The failure code recorded when the provider could not be reached at all.
 *
 * Synthetic, like `provider_reported_failure` and `authentication_expired`,
 * and written on the renewal for two reasons. It tells an operator reading the
 * row that the last thing that happened was our own call failing rather than
 * the customer's card being refused - which is what the previous code, left
 * untouched, used to imply. And it is the marker
 * {@link rescheduleAfterTransportError} reads back to tell a first transport
 * failure from a run of them.
 */
export const RENEWAL_TRANSPORT_ERROR_CODE = "transport_unavailable";

/**
 * How long a renewal may go without the provider answering at all before the
 * transport path stops being patient.
 *
 * **This is the line between an outage and a misconfiguration.** Nothing about
 * a provider having a bad hour should cost a customer a dunning rung, so the
 * transport path spends none - but that patience has to end somewhere, because
 * the failures it is patient about are not all temporary. A Stripe integration
 * switched off in admin, a secret rotated to another account, a stored token
 * that answers `resource_missing`, a currency the account cannot take: every
 * one of them throws rather than returning a decline, and every one of them
 * will still be throwing next week.
 *
 * Without a bound those renewals reschedule every fifteen minutes for ever.
 * `attempt` never moves, so the ladder never exhausts; `notifyRenewalDecline`
 * is never reached, so the customer is never told anything at all; and the
 * server is suspended at `terminates_at + RENEWAL_SUSPENSION_GRACE_DAYS` with
 * the first news of it being the machine going off.
 *
 * Twelve hours is chosen to sit comfortably past any real provider incident -
 * those are measured in minutes to a couple of hours, and forty-eight retries
 * is a generous wait for one - while still being half a day rather than a week
 * of silence for the customer.
 */
export const RENEWAL_TRANSPORT_ESCALATION_HOURS = 12;

/**
 * Decline codes that mean *this credential* will never work again, as opposed
 * to *this charge* having been refused.
 *
 * Deliberately narrower than the adapter's `TERMINAL_DECLINE_CODES`, and it
 * has to stay that way: `invalid_at` is a mark on a row that every one of the
 * customer's subscriptions reads, so a code that means "not this purchase"
 * (`fraudulent`, `merchant_blacklist`, `transaction_not_allowed`) must not
 * land here or one refused charge disables a working card everywhere.
 *
 * It is also not a subset of the terminal codes. `expired_card` is retryable
 * by the adapter's reckoning - and rightly, since Stripe often has the updated
 * card by the next attempt - but it names a credential rather than a charge,
 * so the customer is told which card to fix. That is why this is consulted for
 * every decline and not only the terminal ones.
 */
const DEAD_CREDENTIAL_CODES = new Set([
  "card_not_supported",
  "expired_card",
  "invalid_account",
  "invalid_card_type",
  "lost_card",
  "pickup_card",
  "restricted_card",
  "revocation_of_all_authorizations",
  "revocation_of_authorization",
  "stolen_card",
]);

/** The `payments.status` each off-session answer implies. */
const PAYMENT_STATUS_FOR: Record<OffSessionResult["status"], PaymentStatus> = {
  succeeded: "succeeded",
  processing: "processing",
  // The intent is live and chargeable, and nothing has been refused.
  requires_action: "pending",
  failed: "failed",
};

/**
 * What one attempt did to a renewal.
 *
 * Declared in `./renewal-outcome` and re-exported here, which is where it has
 * always been read from. The move is only so that the dunning mailer this
 * module calls can name these states without importing the module that calls
 * it; see the note at the top of `dunning-mail.ts`.
 */
export type { RenewalOutcome };

export interface RecordedRenewalOutcome {
  outcome: RenewalOutcome;
  /** When the renewal will be looked at again, if it will be. */
  nextAttemptAt: Date | null;
  /** The attempt count as it stands after this outcome. */
  attempt: number;
}

/**
 * Takes a renewal that is waiting to be charged and marks it in flight.
 *
 * **This is the claim for an attempt, and it is what makes two overlapping
 * sweeps safe.** `status = 'collecting'` is written in its own transaction
 * immediately before the provider is called, so exactly one of two workers
 * that both found the same renewal due gets a row back and the other gets
 * `null` and stops. The renewal table's partial index on
 * `(updated_at) WHERE status = 'collecting'` exists for the other half of the
 * same story: a row that has *sat* in this state is a worker that went away
 * mid-charge, which is what `reconcileRenewals` sweeps up.
 *
 * Deliberately does not touch `attempt`. The attempt is what the idempotency
 * key is built from, and a crash between here and the charge has to be able to
 * present the same key again.
 */
export const markRenewalCollecting = async (
  renewalId: string,
): Promise<SubscriptionRenewal | null> =>
  db
    .update(subscriptionRenewals)
    .set({ status: "collecting", nextAttemptAt: null })
    .where(
      and(
        eq(subscriptionRenewals.id, renewalId),
        // `pending` is a fresh claim or a scheduled retry; `awaiting_action`
        // is a renewal whose authentication window has run out and which the
        // reconciler is turning back into an attempt. Nothing else may be
        // charged: `succeeded` and `abandoned` are settled, `failed` is out of
        // rungs, and `collecting` is somebody else's attempt in flight.
        inArray(subscriptionRenewals.status, ["pending", "awaiting_action"]),
      ),
    )
    .returning()
    .then(([row]) => row ?? null);

interface RenewalRow {
  id: string;
  subscriptionId: string;
  status: SubscriptionRenewal["status"];
  attempt: number;
  amount: number;
  currency: string;
  orderId: string | null;
  /**
   * The instant the paid-for term ran out, which is `servers.terminates_at` to
   * the second. The final warning quotes the suspension date off it.
   */
  periodStart: Date;
}

/**
 * Records the payment the provider made, or refused to make.
 *
 * The row is what `reconcileRenewals` reads to ask the provider about an
 * attempt whose answer was lost, so it is written whenever there is an
 * external id to write - a declined charge included, since Stripe creates the
 * intent before the issuer refuses it.
 *
 * `onConflictDoNothing` rather than an upsert: `applyPaymentEvent` owns this
 * row once a webhook has spoken, and a charge whose webhook beat this write
 * back must not be dragged from `succeeded` to whatever the HTTP response
 * happened to say.
 */
const recordPaymentAttempt = async (
  tx: Transaction,
  {
    renewal,
    userId,
    result,
    paymentMethod,
  }: {
    renewal: RenewalRow;
    userId: string;
    result: OffSessionResult;
    paymentMethod: RenewalPaymentMethod | null;
  },
): Promise<void> => {
  const externalId = "externalId" in result ? result.externalId : undefined;
  if (!externalId || !paymentMethod) return;

  await tx
    .insert(payments)
    .values({
      orderId: renewal.orderId,
      userId,
      provider: paymentMethod.provider,
      externalId,
      status: PAYMENT_STATUS_FOR[result.status],
      amount: renewal.amount,
      capturedAmount: result.status === "succeeded" ? renewal.amount : 0,
      currency: renewal.currency,
      method: paymentMethod.type,
      failureReason: result.status === "failed" ? result.message : null,
    })
    .onConflictDoNothing({
      target: [payments.provider, payments.externalId],
    });
};

/**
 * Turns what the provider said into what the renewal now is.
 *
 * **This never advances the term or the period, and nothing in this file may
 * ever be changed to.** `subscriptions.current_period_end` mirrors
 * `servers.terminates_at`, and the only place the pair moves is
 * `storeServerExtensionStep`, inside the transaction that also moves the
 * server - which runs when the payment has actually settled and the extension
 * has been fulfilled. A charge that was *submitted* is not a term: an
 * off-session charge can still fail after `processing`, a webhook can arrive
 * saying so, and a period advanced here would have handed out a month nobody
 * paid for with nothing left to detect it. The single most important
 * invariant in this module is that a successful collection writes
 * `collecting` and stops.
 *
 * Runs in one transaction, and the transition that follows runs in its own -
 * `transitionSubscription` takes its own row lock, so calling it from inside
 * this one would either deadlock against that lock or run on a second pooled
 * connection that cannot see the uncommitted renewal.
 */
export const recordCollectionResult = async (
  renewalId: string,
  { result, paymentMethod }: RenewalCollection,
): Promise<RecordedRenewalOutcome> => {
  const decided = await db.transaction(
    async (tx) => {
      const renewal = await tx
        .select({
          id: subscriptionRenewals.id,
          subscriptionId: subscriptionRenewals.subscriptionId,
          status: subscriptionRenewals.status,
          attempt: subscriptionRenewals.attempt,
          amount: subscriptionRenewals.amount,
          currency: subscriptionRenewals.currency,
          orderId: subscriptionRenewals.orderId,
          periodStart: subscriptionRenewals.periodStart,
        })
        .from(subscriptionRenewals)
        .where(eq(subscriptionRenewals.id, renewalId))
        .limit(1)
        .for("update")
        .then(([row]) => row);

      if (!renewal) {
        throw new Error(`Renewal ${renewalId} does not exist.`);
      }

      // Set only by the transaction that actually flips `invalid_at`, which
      // is what keeps the expiry notice to one mail per credential rather
      // than one per attempt.
      let credentialInvalidated = false;

      // The row is only ours while it is still the one we charged against.
      // A webhook that has already settled it - `succeeded`, with the term
      // moved by the extension - must win over an answer we are only now
      // getting round to writing down.
      if (renewal.status !== "collecting") {
        return {
          outcome: "superseded" as const,
          nextAttemptAt: null,
          attempt: renewal.attempt,
          subscriptionId: renewal.subscriptionId,
          amount: renewal.amount,
          currency: renewal.currency,
          periodStart: renewal.periodStart,
          credentialInvalidated,
        };
      }

      const subscription = await tx
        .select({ userId: subscriptions.userId })
        .from(subscriptions)
        .where(eq(subscriptions.id, renewal.subscriptionId))
        .limit(1)
        .then(([row]) => row);

      if (!subscription) {
        throw new Error(
          `Renewal ${renewalId} points at subscription ${renewal.subscriptionId}, which does not exist.`,
        );
      }

      await recordPaymentAttempt(tx, {
        renewal,
        userId: subscription.userId,
        result,
        paymentMethod,
      });

      if (result.status === "succeeded" || result.status === "processing") {
        // Left `collecting`. The webhook settles it through
        // `applyPaymentEvent` -> `fulfilOrder` -> the extension workflow,
        // which is the only path that advances the term, and
        // `reconcileRenewals` asks the provider directly if that webhook never
        // arrives.
        await tx
          .update(subscriptionRenewals)
          .set({ nextAttemptAt: null, failureCode: null, failureMessage: null })
          .where(eq(subscriptionRenewals.id, renewalId));

        return {
          outcome: "collecting" as const,
          nextAttemptAt: null,
          attempt: renewal.attempt,
          subscriptionId: renewal.subscriptionId,
          amount: renewal.amount,
          currency: renewal.currency,
          periodStart: renewal.periodStart,
          credentialInvalidated,
        };
      }

      if (result.status === "requires_action") {
        // **Not a decline, so `attempt` does not move.** The issuer wants the
        // customer to authenticate and the intent is still live and still
        // chargeable. Spending a rung here would retry a charge that must not
        // be retried and mail the customer that their payment failed instead
        // of the one link that would finish it.
        const deadline = new Date(
          Date.now() + RENEWAL_AUTHENTICATION_WINDOW_HOURS * 60 * 60 * 1000,
        );

        await tx
          .update(subscriptionRenewals)
          .set({
            status: "awaiting_action",
            // The end of the authentication window rather than a retry: the
            // reconciler reads it as the deadline past which an unanswered
            // renewal falls back into the ladder.
            nextAttemptAt: deadline,
            failureCode: null,
            failureMessage: null,
          })
          .where(eq(subscriptionRenewals.id, renewalId));

        return {
          outcome: "awaiting_action" as const,
          nextAttemptAt: deadline,
          attempt: renewal.attempt,
          subscriptionId: renewal.subscriptionId,
          amount: renewal.amount,
          currency: renewal.currency,
          periodStart: renewal.periodStart,
          credentialInvalidated,
        };
      }

      // A decline. This is the only branch that spends a rung.
      const dead = DEAD_CREDENTIAL_CODES.has(result.code);

      if (dead && paymentMethod && !paymentMethod.invalidAt) {
        // Named rather than guessed at: with this set, the first dunning email
        // says "your card expired", which is the wording that gets a customer
        // to act, and every later attempt refuses locally instead of
        // presenting a credential the issuer has already buried.
        //
        // `WHERE invalid_at IS NULL ... RETURNING` rather than a bare update,
        // because the row was read outside this transaction and may have been
        // marked since. Two things ride on the guard: the first stored reason
        // is kept rather than being overwritten by whichever attempt lost the
        // race, and exactly one caller can ever come back holding the fact
        // that *it* was the one that marked the credential dead - which is the
        // idempotency key for the expiry notice.
        credentialInvalidated = await tx
          .update(paymentMethods)
          .set({ invalidAt: sql`now()`, invalidReason: result.code })
          .where(
            and(
              eq(paymentMethods.id, paymentMethod.id),
              isNull(paymentMethods.invalidAt),
            ),
          )
          .returning({ id: paymentMethods.id })
          .then(([row]) => Boolean(row));
      }

      const failure = {
        failureCode: result.code,
        failureMessage: result.message,
      };

      if (!result.retryable) {
        // The provider says this credential can never come good. Presenting it
        // four more times over a week is four more declines on the customer's
        // card and four more emails saying the same thing, so the remaining
        // rungs are struck off - `attempt` records that they will not happen.
        //
        // The subscription stays `past_due` rather than being suspended:
        // nothing about this says the customer will not pay, only that this
        // card will not. The machine is already off - `terminates_at` ran out
        // at the moment this period fell due and
        // `/api/cron/suspend-terminated-servers` powers a server down within
        // fifteen minutes of that - and `/api/cron/delete-suspended-servers`
        // ends the subscription when the deletion grace period proves nobody
        // came back. Suspending here would add nothing and take away the state
        // a customer's new card can be applied to.
        const attempt = exhaustedRenewalAttempt(renewal.attempt);

        await tx
          .update(subscriptionRenewals)
          .set({
            status: "failed",
            attempt,
            nextAttemptAt: null,
            settledAt: sql`now()`,
            ...failure,
          })
          .where(eq(subscriptionRenewals.id, renewalId));

        return {
          outcome: "no_retries" as const,
          nextAttemptAt: null,
          attempt,
          subscriptionId: renewal.subscriptionId,
          amount: renewal.amount,
          currency: renewal.currency,
          periodStart: renewal.periodStart,
          credentialInvalidated,
        };
      }

      const attempt = renewal.attempt + 1;
      const nextAttemptAt = nextRenewalAttemptAt(attempt);

      if (!nextAttemptAt) {
        // The ladder is out of rungs.
        await tx
          .update(subscriptionRenewals)
          .set({
            status: "abandoned",
            attempt,
            nextAttemptAt: null,
            settledAt: sql`now()`,
            ...failure,
          })
          .where(eq(subscriptionRenewals.id, renewalId));

        return {
          outcome: "exhausted" as const,
          nextAttemptAt: null,
          attempt,
          subscriptionId: renewal.subscriptionId,
          amount: renewal.amount,
          currency: renewal.currency,
          periodStart: renewal.periodStart,
          credentialInvalidated,
        };
      }

      // Back to `pending` rather than `failed`, so the row matches the partial
      // index the retry sweep is written against -
      // `(next_attempt_at) WHERE status IN ('pending', 'awaiting_action')`.
      // A renewal parked in `failed` between rungs would still be found, by a
      // sequential scan of every renewal the business has ever attempted.
      await tx
        .update(subscriptionRenewals)
        .set({ status: "pending", attempt, nextAttemptAt, ...failure })
        .where(eq(subscriptionRenewals.id, renewalId));

      return {
        outcome: "retry_scheduled" as const,
        nextAttemptAt,
        attempt,
        subscriptionId: renewal.subscriptionId,
        amount: renewal.amount,
        currency: renewal.currency,
        periodStart: renewal.periodStart,
        credentialInvalidated,
      };
    },
    { accessMode: "read write", isolationLevel: "read committed" },
  );

  await followSubscriptionState(
    decided.subscriptionId,
    decided.outcome,
    result,
  );

  if (result.status === "failed") {
    // ── Telling the customer. After the commit, never inside it. ────────────
    //
    // The renewal is decided and durable by this point, which is what makes
    // the send safe to skip on failure and safe to condition on: the row's
    // `attempt` is the idempotency key, and only the caller that moved this
    // row out of `collecting` gets here at all - a redelivered webhook or a
    // second reconcile pass reads `superseded` above and mails nothing.
    //
    // Sending from inside the transaction would hold a row lock across an
    // HTTP call to a mail provider, and would mail a customer about a decline
    // that a rollback then un-recorded.
    //
    // Never throws; a mail outage must not fail a collection.
    await notifyRenewalDecline({
      renewalId,
      subscriptionId: decided.subscriptionId,
      outcome: decided.outcome,
      attempt: decided.attempt,
      periodStart: decided.periodStart,
      amount: decided.amount,
      currency: decided.currency,
      failureCode: result.code,
      nextAttemptAt: decided.nextAttemptAt,
      card: paymentMethod
        ? { brand: paymentMethod.brand, last4: paymentMethod.last4 }
        : null,
      credentialInvalidated: decided.credentialInvalidated,
    });
  }

  return {
    outcome: decided.outcome,
    nextAttemptAt: decided.nextAttemptAt,
    attempt: decided.attempt,
  };
};

/**
 * Reschedules a renewal whose charge could not be attempted at all.
 *
 * **A transport failure must never spend a rung.** An unreachable provider, a
 * timeout, a 500 - none of them say anything about the customer's credential,
 * and letting them consume the ladder means an hour of somebody else's
 * downtime suspends servers whose cards were fine. `attempt` is therefore left
 * exactly as it was, which also means the next try presents the same
 * idempotency key: if the request did reach the provider and only the response
 * was lost, that returns the original charge instead of making a second one.
 *
 * The subscription is not moved either. Nothing has been declined, so telling
 * a customer they are `past_due` because our own call timed out would be a
 * lie with a dunning email attached to it.
 *
 * **[!] And no mail is sent from here while the provider may simply be down.**
 * Nothing about the customer's card has gone wrong, so "we couldn't take
 * payment for your server" would be false, alarming, and about our own outage.
 * The only thing that changed is when we will ask the provider again, and that
 * is not news. `dunning-mail.test.ts` asserts the silence.
 *
 * ## The bound, and why there has to be one
 *
 * Patience is right for an outage and wrong for a misconfiguration, and the
 * two look identical from here - both throw. So the reschedule is bounded by
 * {@link RENEWAL_TRANSPORT_ESCALATION_HOURS}, measured from the last time we
 * actually reached the provider about this renewal, and past that the failure
 * is recorded as a decline through {@link recordCollectionResult} like any
 * other: a rung is spent, the ladder schedules the next one, the customer is
 * told, and the subscription follows. The code is
 * {@link RENEWAL_TRANSPORT_ERROR_CODE} and `retryable` is true, because it is
 * still not the customer's card that is at fault - it just is not something
 * that will fix itself, and half a day of silence is as much as a customer
 * about to lose a server can be asked to take.
 *
 * **What "the last time we reached the provider" means.** The newest payment
 * row on the renewal's order: `recordCollectionResult` writes one for every
 * answer that carried an external id, a decline included, so its timestamp is
 * the provider's last word about this renewal. A renewal that has never got an
 * answer at all has none, and falls back to its own `created_at` - the instant
 * the period was claimed, which is when the first charge was attempted.
 * Anchoring on the claim rather than on `period_start` is what keeps a
 * collector that was itself switched off for a day from escalating the moment
 * it comes back: the claim is taken on the way back up.
 *
 * The escalation additionally requires the *previous* outcome to have been a
 * transport failure, so the very first one after a quiet spell always
 * reschedules rather than declining.
 */
export const rescheduleAfterTransportError = async (
  renewalId: string,
  error: unknown,
): Promise<RecordedRenewalOutcome> => {
  const nextAttemptAt = new Date(
    Date.now() + RENEWAL_TRANSPORT_BACKOFF_MINUTES * 60 * 1000,
  );

  const reason = error instanceof Error ? error.message : String(error);

  const rescheduled = await db.transaction(
    async (tx) => {
      const renewal = await tx
        .select({
          status: subscriptionRenewals.status,
          attempt: subscriptionRenewals.attempt,
          failureCode: subscriptionRenewals.failureCode,
          orderId: subscriptionRenewals.orderId,
          createdAt: subscriptionRenewals.createdAt,
        })
        .from(subscriptionRenewals)
        .where(eq(subscriptionRenewals.id, renewalId))
        .limit(1)
        .for("update")
        .then(([row]) => row);

      if (!renewal) {
        throw new Error(`Renewal ${renewalId} does not exist.`);
      }

      if (renewal.status !== "collecting") {
        return { outcome: "superseded" as const, attempt: renewal.attempt };
      }

      const lastAnswer = renewal.orderId
        ? await tx
            .select({ at: payments.createdAt })
            .from(payments)
            .where(eq(payments.orderId, renewal.orderId))
            .orderBy(desc(payments.createdAt))
            .limit(1)
            .then(([row]) => row?.at ?? null)
        : null;

      const silentSince =
        lastAnswer && lastAnswer > renewal.createdAt
          ? lastAnswer
          : renewal.createdAt;

      const silentFor = Date.now() - silentSince.getTime();

      if (
        renewal.failureCode === RENEWAL_TRANSPORT_ERROR_CODE &&
        silentFor >= RENEWAL_TRANSPORT_ESCALATION_HOURS * 60 * 60 * 1000
      ) {
        // Deliberately writes nothing. The row is left `collecting` so that
        // `recordCollectionResult` - which is the only thing that may spend a
        // rung, mail the customer and move the subscription - can take it
        // under its own guard once this transaction has committed.
        return {
          outcome: "escalate" as const,
          attempt: renewal.attempt,
          silentSince,
        };
      }

      await tx
        .update(subscriptionRenewals)
        .set({
          status: "pending",
          // [!] `attempt` is deliberately absent from this update.
          nextAttemptAt,
          // Not the previous decline's code: the last thing that happened to
          // this renewal was our own call failing, and leaving `card_declined`
          // on the row tells an operator the opposite. It is also the marker
          // the escalation above reads back.
          failureCode: RENEWAL_TRANSPORT_ERROR_CODE,
          failureMessage: reason,
        })
        .where(eq(subscriptionRenewals.id, renewalId));

      return { outcome: "rescheduled" as const, attempt: renewal.attempt };
    },
    { accessMode: "read write", isolationLevel: "read committed" },
  );

  if (rescheduled.outcome === "escalate") {
    const hours = Math.floor(
      (Date.now() - rescheduled.silentSince.getTime()) / (60 * 60 * 1000),
    );

    console.error(
      `[renewals] ${renewalId} has not reached its payment provider for ${hours}h; recording it as a decline rather than rescheduling again.`,
      error,
    );
    // A message rather than the exception: the exception is captured on every
    // reschedule already and is one of many, while this says the collector has
    // been unable to charge anybody through this provider for half a day - a
    // configuration fault somebody has to go and fix.
    Sentry.captureMessage(
      `[renewals] ${renewalId} could not reach its payment provider for ${hours}h; escalated to a decline. Check the payment integration's configuration.`,
      "error",
    );

    const declined = await recordCollectionResult(renewalId, {
      result: {
        status: "failed",
        code: RENEWAL_TRANSPORT_ERROR_CODE,
        // Still true, and still the important part: nothing says this
        // customer's card is bad, so the ladder runs its normal course and a
        // provider that comes back collects on the next rung.
        retryable: true,
        message: `The payment provider could not be reached for ${hours} hours. Last error: ${reason}`,
      },
      // No charge was made, so there is no credential to mark and nothing to
      // insert into `payments`.
      paymentMethod: null,
      idempotencyKey: null,
    });

    return declined;
  }

  console.error(
    `[renewals] ${renewalId} could not reach its payment provider; retrying at ${nextAttemptAt.toISOString()} without spending an attempt.`,
    error,
  );
  Sentry.captureException(error, {
    tags: { renewalId, outcome: rescheduled.outcome },
  });

  return {
    outcome: rescheduled.outcome,
    nextAttemptAt: rescheduled.outcome === "rescheduled" ? nextAttemptAt : null,
    attempt: rescheduled.attempt,
  };
};

/**
 * Moves the subscription to match what the collection did, in its own
 * transaction and after the renewal has been committed.
 *
 * Every transition is `idempotent`, because most of them are legal only from
 * some of the states a subscription can be in by the time this runs: a server
 * whose term ran out has usually already been suspended by
 * `/api/cron/suspend-terminated-servers`, and `suspended -> past_due` is not a
 * move the machine allows. A dunning sweep must not fail on that.
 */
const followSubscriptionState = async (
  subscriptionId: string,
  outcome: RenewalOutcome,
  result: OffSessionResult,
): Promise<void> => {
  const reason =
    result.status === "failed" ? result.code : `renewal_${outcome}`;

  try {
    switch (outcome) {
      case "awaiting_action":
      case "retry_scheduled":
      case "no_retries":
        await transitionSubscription(subscriptionId, "past_due", {
          actor: COLLECTOR_ACTOR,
          reason,
          idempotent: true,
        });
        break;
      case "exhausted":
        // The ladder is spent. `suspended` is not terminal - it is the one
        // state money can still fix - and the machine itself was powered off
        // by the terminated-server sweep when its term ran out, which is why
        // nothing here touches the hypervisor.
        await transitionSubscription(subscriptionId, "suspended", {
          actor: COLLECTOR_ACTOR,
          reason: "dunning_exhausted",
          idempotent: true,
        });
        Sentry.captureMessage(
          `[renewals] Subscription ${subscriptionId} exhausted its dunning ladder and was suspended.`,
          "warning",
        );
        break;
      default:
        // `collecting`, `rescheduled` and `superseded` say nothing about the
        // customer's standing, so the subscription is left alone.
        break;
    }
  } catch (error) {
    // The renewal is committed and the sweep has done its work. A subscription
    // that failed to follow is worth reporting, not worth failing a run over -
    // and the next attempt writes the same transition again.
    console.error(
      `[renewals] Failed to move subscription ${subscriptionId} after outcome ${outcome}.`,
      error,
    );
    Sentry.captureException(error);
  }
};
