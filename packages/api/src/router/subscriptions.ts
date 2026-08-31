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
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import {
  and,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "@virtbase/db";
import type { Executor } from "@virtbase/db/client";
import type { RenewalStatus } from "@virtbase/db/schema";
import {
  paymentMethods,
  servers,
  subscriptionRenewals,
  subscriptions,
} from "@virtbase/db/schema";
import type {
  RetrySubscriptionRenewalOutcome,
  Subscription,
} from "@virtbase/validators";
import {
  AcceptSubscriptionMandateInputSchema,
  AcceptSubscriptionMandateOutputSchema,
  CancelSubscriptionInputSchema,
  CancelSubscriptionOutputSchema,
  ListSubscriptionsOutputSchema,
  ResumeSubscriptionInputSchema,
  ResumeSubscriptionOutputSchema,
  RetrySubscriptionRenewalInputSchema,
  RetrySubscriptionRenewalOutputSchema,
  SetSubscriptionAutoRenewInputSchema,
  SetSubscriptionAutoRenewOutputSchema,
  SUBSCRIPTION_MANDATE_TEXT_VERSION,
} from "@virtbase/validators";
// The collector, reached the same way `servers/backups` reaches
// `reconcileServerBackup`: through the package's own module, not through
// `@virtbase/api/billing`, which would be this package importing itself.
import type { RenewSubscriptionOutcome } from "../billing";
import { retryRenewal } from "../billing";
// By path, and deliberately: `./collect` is kept out of the `@virtbase/api/billing`
// barrel because it reads `payment_methods.external_id`, and the barrel is an
// entry point `apps/web` imports. Reaching in is the sanctioned way to want it -
// see the note on that barrel. `usablePaymentMethodId` is the only caller here,
// it returns an id the customer can already see, and the credential never
// leaves it.
import { resolveRenewalPaymentMethod } from "../billing/collect";
import {
  isRenewableSubscriptionStatus,
  RENEWABLE_SUBSCRIPTION_STATUSES,
} from "../lib/subscription-status";
import { SERVER_SUBJECT_TYPE } from "../subscriptions/subject-subscription";
import { transitionSubscription } from "../subscriptions/transition-subscription";
import { protectedProcedure } from "../trpc";

type Database = Parameters<
  Parameters<typeof protectedProcedure.query>[0]
>[0]["ctx"]["db"];

/** `customer:<user id>`, the actor vocabulary `transitionSubscription` logs. */
const customerActor = (userId: string) => `customer:${userId}`;

/**
 * A saved credential is worth more than anything else a key can reach.
 *
 * The auth middleware already refuses an API key on any procedure that
 * declares no `permissions` - which is every procedure in this file, on
 * purpose. This repeats the refusal at the top of each mutation the way
 * `checkout.order` and `payment-methods` do: turning automatic renewal on
 * points future money at a stored card, and a bearer credential with nobody
 * behind it must not be able to do that, nor to cancel a service on the
 * customer's behalf.
 */
const refuseApiKey = (apiKey: unknown) => {
  if (apiKey) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
};

/**
 * The columns a customer may see, already in wire shape.
 *
 * A projection rather than the row, for the same reason
 * `paymentMethodSummaryColumns` is one: a column added to `subscriptions`
 * cannot leak by being picked up somewhere a `select()` was written without
 * one. `mandate_text_version` is deliberately absent - it is the artefact a
 * dispute is decided on, not something a dashboard renders.
 *
 * camelCase in the database, snake_case on the wire, the convention
 * `abuseRouter` and `payment-methods` established.
 */
const subscriptionColumns = {
  id: subscriptions.id,
  subject_type: subscriptions.subjectType,
  subject_id: subscriptions.subjectId,
  // Left-joined: `subject_id` is not a foreign key, so a subscription can
  // outlive the server it paid for and there may be no name left to show.
  subject_name: servers.name,
  status: subscriptions.status,
  interval_months: subscriptions.intervalMonths,
  currency: subscriptions.currency,
  current_period_start: subscriptions.currentPeriodStart,
  current_period_end: subscriptions.currentPeriodEnd,
  auto_renew: subscriptions.autoRenew,
  mandate_accepted_at: subscriptions.mandateAcceptedAt,
  cancelled_at: subscriptions.cancelledAt,
  cancel_reason: subscriptions.cancelReason,
  created_at: subscriptions.createdAt,
  // The credential this subscription names, if it names one. Brand and last
  // four only: `provider` and `external_id` are never selected here, and the
  // output schema refuses them a second time.
  named_method_id: paymentMethods.id,
  named_method_brand: paymentMethods.brand,
  named_method_last4: paymentMethods.last4,
} as const;

/**
 * The account default, which is what a renewal charges when the subscription
 * names no credential of its own.
 *
 * Detached rows are excluded, matching
 * `payment_methods_user_id_default_index`.
 */
const findDefaultPaymentMethod = async (executor: Executor, userId: string) =>
  executor
    .select({
      id: paymentMethods.id,
      brand: paymentMethods.brand,
      last4: paymentMethods.last4,
    })
    .from(paymentMethods)
    .where(
      and(
        // [!] Authorization: only ever the caller's own credentials
        eq(paymentMethods.userId, userId),
        eq(paymentMethods.isDefault, true),
        isNull(paymentMethods.detachedAt),
      ),
    )
    .limit(1)
    .then(([row]) => row ?? null);

/**
 * The caller's subscriptions, or one of them.
 *
 * `subscriptionId` narrows to a single row and is **a filter, never a
 * selector**: it is applied together with `userId`, so another customer's id
 * simply matches nothing rather than being found and then refused.
 */
const loadSubscriptions = async (
  db: Database,
  userId: string,
  subscriptionId?: string,
): Promise<Subscription[]> =>
  db.transaction(
    async (tx) => {
      const rows = await tx
        .select(subscriptionColumns)
        .from(subscriptions)
        .leftJoin(
          servers,
          and(
            eq(subscriptions.subjectType, SERVER_SUBJECT_TYPE),
            eq(subscriptions.subjectId, servers.id),
          ),
        )
        .leftJoin(
          paymentMethods,
          and(
            eq(subscriptions.paymentMethodId, paymentMethods.id),
            // Redundant next to `subscriptions_payment_method_owner_fkey`,
            // which already makes the database refuse a subscription naming
            // another customer's card. Repeated because a join is where that
            // would show up if the constraint were ever dropped.
            eq(paymentMethods.userId, userId),
            // A detached credential is not the one that would be charged.
            // `resolveRenewalPaymentMethod` falls through to the account
            // default when the named credential has been removed, so joining
            // it here would name a card on the dashboard that no renewal will
            // ever present - and would send a customer to replace a card that
            // pays for nothing. Null here is what makes the fallback below
            // run, which is the same answer the collector reaches.
            isNull(paymentMethods.detachedAt),
          ),
        )
        .where(
          and(
            // [!] Authorization: only ever the caller's own subscriptions
            eq(subscriptions.userId, userId),
            subscriptionId ? eq(subscriptions.id, subscriptionId) : undefined,
          ),
        )
        // Newest first: the service a customer just bought is the one they
        // came to look at. The id is a ULID, so it breaks ties in the same
        // order rather than arbitrarily.
        .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id));

      const defaultMethod = rows.some((row) => !row.named_method_id)
        ? await findDefaultPaymentMethod(tx, userId)
        : null;

      return rows.map(
        ({
          named_method_id: namedId,
          named_method_brand: namedBrand,
          named_method_last4: namedLast4,
          ...subscription
        }) => ({
          ...subscription,
          // A null `payment_method_id` means "whatever is default at
          // collection time", so showing nothing here would tell a customer
          // with one card on file that they have none.
          payment_method: namedId
            ? { id: namedId, brand: namedBrand, last4: namedLast4 }
            : defaultMethod,
        }),
      );
    },
    { accessMode: "read only", isolationLevel: "read committed" },
  );

const loadOwnSubscription = async (
  db: Database,
  userId: string,
  subscriptionId: string,
): Promise<Subscription> => {
  const [subscription] = await loadSubscriptions(db, userId, subscriptionId);

  if (!subscription) throw new TRPCError({ code: "NOT_FOUND" });

  return subscription;
};

/**
 * The subscription as a decision needs it, scoped to its owner.
 *
 * Separate from {@link loadSubscriptions} because a mutation needs three
 * things the wire shape does not carry: `payment_method_id` (which credential
 * was named, as opposed to which one would be charged), `updated_at` (the
 * optimistic-concurrency token `transitionSubscription` takes), and the
 * database's own answer to "is this period still running".
 */
const loadOwnSubscriptionState = async (
  db: Database,
  userId: string,
  subscriptionId: string,
) => {
  const row = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      autoRenew: subscriptions.autoRenew,
      paymentMethodId: subscriptions.paymentMethodId,
      mandateAcceptedAt: subscriptions.mandateAcceptedAt,
      updatedAt: subscriptions.updatedAt,
      // Asked of the database rather than compared against `Date.now()`, so
      // "is the customer still inside the term they paid for" uses the same
      // clock the collector does. A host whose clock has drifted would
      // otherwise refuse a resume that is perfectly in time, or allow one that
      // is not.
      withinPeriod: sql<boolean>`${subscriptions.currentPeriodEnd} > now()`,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        // [!] Authorization: the id is matched together with the caller, so
        // another customer's subscription is simply not found.
        eq(subscriptions.userId, userId),
      ),
    )
    .limit(1)
    .then(([first]) => first);

  if (!row) throw new TRPCError({ code: "NOT_FOUND" });

  return row;
};

/**
 * Whether there is a credential a renewal could actually be charged to.
 *
 * **The rule is not restated here.** Which credential a renewal charges is
 * {@link resolveRenewalPaymentMethod}'s decision and only ever that one - this
 * asks the collector the same question the collector will ask itself, and the
 * two therefore cannot disagree. They did: a second copy of the rule refused a
 * subscription whose named credential had been detached, while the collector
 * fell through to the account default exactly as it was designed to, so the
 * customer was told to add a payment method they already had and sent to a
 * billing page with nothing on it to fix.
 *
 * "Usable" is one thing on top of that resolution: the provider has not told
 * us the credential is dead. `resolveRenewalPaymentMethod` deliberately hands
 * an `invalid_at` credential back rather than falling through - what to do
 * with a dead card is the caller's decision - and for enrolment the answer is
 * no. A subscription that names a credential the provider has buried is not
 * rescued by the default: the customer chose that one, and swapping it here
 * would charge a card they did not pick.
 *
 * **The id comes back, not a boolean, because the write has to re-assert it.**
 * This runs outside the transaction that turns the flag on - the collector
 * binds its own `db` and cannot be handed one - so by the time the update
 * lands the answer may have stopped being true. Returning which credential was
 * approved is what lets {@link subscriptionsRouter.setAutoRenew} put "and that
 * one is still live" into the `WHERE`, in the same statement as the write.
 * `payment_methods.id` is already on the wire - `list` renders it - so this is
 * the one field of the row that can leave.
 *
 * The credential itself still never leaves. `provider` and `externalId` are on
 * the row because a charge cannot be made without them; neither is returned,
 * and nothing is logged.
 *
 * [!] Authorization: the subscription is the caller's own - every call site
 * reaches this through {@link loadOwnSubscriptionState} - and the collector
 * scopes credentials to that subscription's own `user_id`, so no credential of
 * anyone else's can satisfy it.
 */
const usablePaymentMethodId = async (
  subscriptionId: string,
): Promise<string | null> => {
  const method = await resolveRenewalPaymentMethod(subscriptionId);

  return method && null === method.invalidAt ? method.id : null;
};

/**
 * Renewal statuses a manual retry may act on.
 *
 * **Only `pending`,** which is the same filter `retryDueRenewals` applies and
 * for the same reason. `markRenewalCollecting` would also take
 * `awaiting_action`, and taking it here is a double charge: the idempotency
 * key is `renewal:<id>:<attempt>`, the attempt is not spent while a customer
 * is authenticating, and a provider key expires after 24 hours where the
 * authentication window runs for `RENEWAL_AUTHENTICATION_WINDOW_HOURS` - 72.
 * Pressed on the second day, the key the collector rebuilds means nothing to
 * the provider any more, so it creates and confirms a *second* payment while
 * the first is still live and still confirmable by the customer - precisely
 * the thing the key exists to prevent. `awaiting_action` is refused above with
 * a sentence of its own.
 *
 * The rest were never retryable: `collecting` is somebody else's attempt in
 * flight; `succeeded` is settled; `failed` and `abandoned` are out of rungs
 * and need a different credential, not another press of the same button. They
 * are named here so the refusal is a sentence the customer can act on rather
 * than a silent `superseded` three network hops later.
 */
const RETRYABLE_RENEWAL_STATUSES = new Set<RenewalStatus>(["pending"]);

/**
 * The collector's vocabulary, narrowed to what a customer needs to hear.
 *
 * `superseded` and `not_claimed` mean another worker got there first, and
 * `not_collectable` means the subscription may no longer be charged. None of
 * the three is a thing that happened to the customer's money, so all three say
 * the same thing.
 */
const CUSTOMER_FACING_OUTCOMES: Record<
  RenewSubscriptionOutcome,
  RetrySubscriptionRenewalOutcome
> = {
  collecting: "collecting",
  awaiting_action: "awaiting_action",
  retry_scheduled: "retry_scheduled",
  rescheduled: "retry_scheduled",
  no_retries: "exhausted",
  exhausted: "exhausted",
  superseded: "not_attempted",
  not_claimed: "not_attempted",
  not_collectable: "not_attempted",
};

/**
 * The customer's own subscriptions.
 *
 * Session-only: no `openapi` metadata and no API key permissions, so a key is
 * refused by the auth middleware before any of this runs. Every id arriving
 * from a client is a filter - the queries underneath scope by `ctx.userId` in
 * their `WHERE` and never select a row on an id alone.
 *
 * The four mutations are deliberately four, not one: `acceptMandate` records
 * consent, `setAutoRenew` acts on it, `cancel` withdraws from the arrangement
 * and `retryNow` pushes a failing collection along. Consent and enrolment in
 * particular must never be the same call - see `acceptMandate`.
 */
export const subscriptionsRouter = {
  list: protectedProcedure
    .output(ListSubscriptionsOutputSchema)
    .query(async ({ ctx }) => ({
      subscriptions: await loadSubscriptions(
        ctx.db,
        // [!] Authorization: only ever the caller's own subscriptions
        ctx.userId,
      ),
    })),

  /**
   * Records that the customer agreed we may charge them while not present.
   *
   * This writes the artefact a payment dispute is decided on. Everything about
   * it is shaped by that:
   *
   * - **The version is checked, not trusted.** A client that may send an
   *   arbitrary string can record that the customer accepted wording which
   *   never existed, which is worse than recording nothing - it is a defence
   *   that falls apart the moment anyone asks to see the text. Only
   *   `SUBSCRIPTION_MANDATE_TEXT_VERSION` is accepted, so a tab left open
   *   across a wording change is refused and asked to read the new one.
   * - **It does not turn renewal on.** Consent and enrolment are two
   *   decisions. Setting `auto_renew` here would enrol a customer by virtue of
   *   their having read the terms, which is precisely the "pre-ticked box"
   *   that makes the consent worthless. `setAutoRenew` is the second call, and
   *   it is the one the customer's switch makes.
   * - **Re-accepting is allowed.** A customer who cancelled and came back
   *   consents again, against whatever wording is in force then, and both
   *   columns move. There is no history table; the row is the current
   *   agreement, and the previous one ended when the customer withdrew from
   *   it.
   *
   * No status gate. Consent is a record of something the customer did, not an
   * action on the service, and refusing to record it on, say, a `suspended`
   * subscription would only mean the customer has to consent again after
   * paying - having already read the same text once.
   */
  acceptMandate: protectedProcedure
    .meta({
      ratelimit: {
        requests: 20,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `subscription-accept-mandate:${userId || defaultFingerprint}`,
      },
    })
    .input(AcceptSubscriptionMandateInputSchema)
    .output(AcceptSubscriptionMandateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.apiKey);

      if (SUBSCRIPTION_MANDATE_TEXT_VERSION !== input.version) {
        // Not `PRECONDITION_FAILED`: nothing about the subscription is wrong,
        // the client is describing text we did not show. The only way out is
        // to load the current wording and read it, which is what the message
        // asks for.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That is not the agreement currently in force. Reload the page and read the current one.",
        });
      }

      const { db, userId } = ctx;

      const accepted = await db
        .update(subscriptions)
        .set({
          // The database's clock, the one a dispute is reconstructed against
          // and the same one `current_period_end` is compared to elsewhere in
          // this file. A host with a drifted clock must not be able to date a
          // consent record.
          mandateAcceptedAt: sql`now()`,
          // The constant, never `input.version`, even though the two are equal
          // by the check above: what is stored is what the server believes it
          // showed.
          mandateTextVersion: SUBSCRIPTION_MANDATE_TEXT_VERSION,
        })
        .where(
          and(
            eq(subscriptions.id, input.id),
            // [!] Authorization: the id is a filter applied together with the
            // caller, so another customer's subscription matches nothing
            // rather than being found and then refused.
            eq(subscriptions.userId, userId),
          ),
        )
        .returning({ id: subscriptions.id })
        .then(([row]) => row);

      if (!accepted) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        subscription: await loadOwnSubscription(db, userId, accepted.id),
      };
    }),

  /**
   * Turns automatic renewal on or off.
   *
   * **On is the direction with preconditions.** Auto-renewal is a
   * merchant-initiated charge - money taken while the customer is not present
   * - and two things have to exist before one can be attempted: a credential
   * that can be charged, and a record of the customer agreeing that we may
   * charge it. Accepting the flag without them would leave a subscription that
   * looks enrolled in the dashboard and fails at the first collection, by
   * which time the customer has stopped expecting to have to do anything.
   *
   * The mandate half is written by {@link subscriptionsRouter.acceptMandate},
   * which the opt-in flow calls immediately before this one. It stays a
   * separate call: a charge with no recorded consent is one the provider
   * reverses on request, and consent that was never a decision of its own is
   * not much better.
   *
   * **Off has none and must keep none.** Withdrawing consent to be charged is
   * never something to gate.
   *
   * **The preconditions are checked twice, and the second time is the one that
   * counts.** The first pass exists to produce a sentence the customer can act
   * on - which of the two things is missing, both of them if both are. It runs
   * outside any lock, and the collector it asks about credentials binds its own
   * `db`, so between that answer and the write a card can be removed in another
   * tab or a `payment_method.detached` can arrive from Stripe. The update
   * therefore re-asserts all three - status, mandate, and the approved
   * credential still being live - in its own `WHERE`, and a subscription that
   * moved underneath gets a `CONFLICT` rather than a flag pointing at nothing.
   */
  setAutoRenew: protectedProcedure
    .meta({
      ratelimit: {
        requests: 20,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `subscription-auto-renew:${userId || defaultFingerprint}`,
      },
    })
    .input(SetSubscriptionAutoRenewInputSchema)
    .output(SetSubscriptionAutoRenewOutputSchema)
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.apiKey);

      const { db, userId } = ctx;
      const subscription = await loadOwnSubscriptionState(db, userId, input.id);

      /**
       * The credential the preconditions approved, and the one the write
       * re-asserts. Null when renewal is being turned *off*, which has no
       * preconditions and therefore nothing to re-assert.
       */
      let approved: string | null = null;

      if (input.enabled) {
        // A status the collector will not act on. `claimRenewal` skips
        // anything that is not `active` or `past_due`, so accepting the flag
        // here would store an instruction nothing can carry out - which is
        // exactly the silent acceptance this procedure exists to refuse. A
        // cancelled subscription is resumed first; the rest cannot renew at
        // all.
        if (!isRenewableSubscriptionStatus(subscription.status)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "cancelled" === subscription.status
                ? "Resume this subscription before turning automatic renewal on."
                : "This subscription can no longer renew.",
          });
        }

        const missing: string[] = [];

        approved = await usablePaymentMethodId(subscription.id);

        if (!approved) {
          missing.push("a usable payment method");
        }

        if (!subscription.mandateAcceptedAt) {
          missing.push("your agreement to automatic charges");
        }

        // Both are named when both are missing. Fixing one and being told
        // about the other is two round trips through a form for something the
        // server knew all along.
        if (0 < missing.length) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Automatic renewal needs ${missing.join(" and ")}.`,
          });
        }
      }

      // Non-null exactly when this call is an enrolment, because the branch
      // above throws otherwise. A `const` so it narrows inside the transaction.
      const enrolAgainst = approved;

      const written = await db.transaction(
        async (tx) => {
          if (enrolAgainst) {
            // Waits out a removal that is already in flight. The checks above
            // ran on another connection and are therefore a moment old; a
            // `removePaymentMethod` or a `payment_method.detached` that has
            // written the row but not yet committed is invisible to the
            // `EXISTS` below, which would read the pre-detach version and let
            // the enrolment through. Taking a share lock on the same row makes
            // this transaction queue behind that writer and then read what it
            // actually committed. A removal that starts *after* this queues
            // behind us instead, which is the ordinary "customer removed the
            // card they just enrolled with" and is somebody else's problem.
            await tx
              .select({ id: paymentMethods.id })
              .from(paymentMethods)
              .where(eq(paymentMethods.id, enrolAgainst))
              .limit(1)
              .for("share");
          }

          return tx
            .update(subscriptions)
            .set({ autoRenew: input.enabled })
            .where(
              and(
                eq(subscriptions.id, subscription.id),
                // [!] Authorization: scoped again at the write, so a read that
                // somehow returned a foreign row still cannot be acted on.
                eq(subscriptions.userId, userId),
                // Every precondition, re-asserted in the statement that acts
                // on it - the same shape as `acceptMandate`'s write and
                // `resume`'s guard, and for the same reason: the decision was
                // taken outside the row lock. A card removed in another tab,
                // or a `payment_method.detached` arriving from Stripe, between
                // the checks above and here would otherwise enrol a
                // subscription with nothing to charge - renewal shown as on in
                // the dashboard, `no_payment_method` at the first collection,
                // and the customer walked down the whole dunning ladder for a
                // credential they had already removed.
                input.enabled
                  ? isNotNull(subscriptions.mandateAcceptedAt)
                  : undefined,
                input.enabled
                  ? inArray(subscriptions.status, [
                      ...RENEWABLE_SUBSCRIPTION_STATUSES,
                    ])
                  : undefined,
                // The credential the collector picked, asked about by id
                // rather than by rule: which one a renewal charges is
                // `resolveRenewalPaymentMethod`'s decision and is not restated
                // here any more than it is above. All this adds is that the
                // row it chose is still live and still not marked dead.
                enrolAgainst
                  ? exists(
                      tx
                        .select({ live: sql`1` })
                        .from(paymentMethods)
                        .where(
                          and(
                            eq(paymentMethods.id, enrolAgainst),
                            // [!] Authorization: a credential of the caller's
                            // own, repeating what the collector already scoped.
                            eq(paymentMethods.userId, userId),
                            isNull(paymentMethods.detachedAt),
                            isNull(paymentMethods.invalidAt),
                          ),
                        ),
                    )
                  : undefined,
              ),
            )
            .returning({ id: subscriptions.id })
            .then(([row]) => row);
        },
        { accessMode: "read write", isolationLevel: "read committed" },
      );

      // Only ever on the way *on*. Turning renewal off carries no guards at
      // all, so the only way it writes nothing is a subscription that has
      // stopped existing, which `loadOwnSubscription` reports as `NOT_FOUND` a
      // line later - withdrawing consent to be charged is never gated, and
      // that includes not being gated by a conflict.
      if (input.enabled && !written) {
        // Deliberately not the precondition message: nothing the customer did
        // is wrong, and the thing that changed may already be fixed. Same
        // answer `resume` gives when it loses its race.
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Something about this subscription or your payment methods changed while you were looking at it. Automatic renewal was not turned on - check your payment methods and try again.",
        });
      }

      return {
        subscription: await loadOwnSubscription(db, userId, subscription.id),
      };
    }),

  /**
   * Stops the subscription renewing, keeping the term already paid for.
   *
   * ## This is the §312k BGB cancellation button
   *
   * German law requires that cancelling an ongoing obligation is at least as
   * easy as entering into one: a button that is always reachable, and a
   * confirmation that completes the cancellation. Three things follow, and
   * none of them is a preference:
   *
   * - **`reason` stays optional.** A required "tell us why you are leaving"
   *   field is exactly the friction the statute forbids. Do not make it
   *   required, and do not add a second field that is.
   * - **One call.** No confirmation step, no retention offer, no
   *   step-up re-authentication. The session that can order a server can
   *   cancel one.
   * - **Nothing else gates it.** No open-invoice check, no abuse hold. A
   *   customer who owes money may still cancel; collecting it is a separate
   *   matter and must not be made a condition of leaving.
   *
   * ## The paid-for term is untouched
   *
   * `current_period_end` is not moved, and `servers.terminates_at` - the
   * column the suspension sweep actually reads - is not touched at all.
   * Cancelling means "do not charge me again", not "take away what I already
   * bought". Revoking access on cancellation would be taking back a service
   * the customer has paid for, and would make cancelling something to put off
   * until the last day, which is its own form of friction.
   */
  cancel: protectedProcedure
    .meta({
      ratelimit: {
        // Deliberately generous. A limit is here because every mutation gets
        // one, not because cancelling is something to discourage: nobody
        // reaches thirty cancellations a minute by hand, and a customer who
        // hits a rate limit while trying to leave has been gated.
        requests: 30,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `subscription-cancel:${userId || defaultFingerprint}`,
      },
    })
    .input(CancelSubscriptionInputSchema)
    .output(CancelSubscriptionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.apiKey);

      const { db, userId } = ctx;
      const subscription = await loadOwnSubscriptionState(db, userId, input.id);

      if ("ended" === subscription.status) {
        // Nothing left to cancel. The only refusal in this procedure, and it
        // refuses a request that has already been granted.
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This subscription has already ended.",
        });
      }

      // Turned off first, and separately from the status. `auto_renew` is what
      // the collector reads, so this is the half that actually stops money
      // moving; doing it before the transition means a failure between the two
      // leaves the customer un-chargeable rather than still enrolled.
      await db
        .update(subscriptions)
        .set({ autoRenew: false })
        .where(
          and(
            eq(subscriptions.id, subscription.id),
            // [!] Authorization: scoped again at the write.
            eq(subscriptions.userId, userId),
          ),
        );

      await transitionSubscription(subscription.id, "cancelled", {
        actor: customerActor(userId),
        // The vocabulary `subscriptions.cancel_reason` documents, not the
        // customer's prose. `input.reason` is feedback about why they left;
        // writing it into this column would corrupt the small set of values
        // every reader of it switches on. It belongs in a table of its own
        // the day anyone wants to report on it - see below.
        reason: "customer",
        // No `guard`, unlike `resume`. Optimistic concurrency here would mean
        // a customer losing a race with a dunning sweep is told to try again,
        // and "try again" is not something a cancellation button may say.
        // `idempotent` covers the two states that cannot reach `cancelled`:
        // `cancelled` itself, where the customer has already got what they
        // asked for, and `suspended`, where the service is already off and
        // `auto_renew: false` above is the whole of what cancelling means.
        idempotent: true,
      });

      if (input.reason) {
        // Kept as a breadcrumb rather than a column. It is genuinely useful -
        // it is the only signal about why customers leave - and it is also
        // free text from a customer, so it does not go anywhere that a reader
        // expects a controlled value.
        Sentry.addBreadcrumb({
          category: "subscription",
          level: "info",
          message: `[subscriptions] ${subscription.id} cancelled by customer`,
          data: { subscriptionId: subscription.id, reason: input.reason },
        });
      }

      return {
        subscription: await loadOwnSubscription(db, userId, subscription.id),
      };
    }),

  /**
   * Takes a cancellation back, while there is still something to take back.
   *
   * Only from `cancelled`, and only inside the period the customer already
   * paid for. Once that has run out the service has stopped and the row is on
   * its way to `ended`; reviving it then would sell a new term without a
   * price, an order or an invoice, so after the period end this is a purchase
   * and belongs to checkout.
   *
   * **Resuming does not switch automatic renewal back on.** It restores the
   * subscription to `active`, which is a statement about the current term, not
   * consent to be charged for the next one - that is `setAutoRenew`, with its
   * own preconditions. A customer who cancelled with renewal on and resumes
   * gets a subscription that runs to its end and stops, which is the safe
   * direction to be wrong in.
   */
  resume: protectedProcedure
    .meta({
      ratelimit: {
        requests: 20,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `subscription-resume:${userId || defaultFingerprint}`,
      },
    })
    .input(ResumeSubscriptionInputSchema)
    .output(ResumeSubscriptionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.apiKey);

      const { db, userId } = ctx;
      const subscription = await loadOwnSubscriptionState(db, userId, input.id);

      if ("cancelled" !== subscription.status) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only a cancelled subscription can be resumed.",
        });
      }

      if (!subscription.withinPeriod) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "The paid-for period has ended. Order the service again to start a new one.",
        });
      }

      const { changed } = await transitionSubscription(
        subscription.id,
        "active",
        {
          actor: customerActor(userId),
          // Optimistic concurrency, because the decision above was made
          // outside the row lock: between reading `cancelled` and writing
          // `active`, an abuse case or an operator may have moved the same
          // row. Refusing on a stale read is reported below rather than
          // silently overwriting theirs.
          guard: (current) =>
            "cancelled" === current.status &&
            current.updatedAt.getTime() === subscription.updatedAt.getTime(),
        },
      );

      if (!changed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This subscription changed while you were looking at it.",
        });
      }

      return {
        subscription: await loadOwnSubscription(db, userId, subscription.id),
      };
    }),

  /**
   * Pushes a failing renewal along, now, because the customer asked.
   *
   * The dunning ladder already retries on its own schedule; this exists for
   * the customer who has just fixed the thing that was broken - a new card, a
   * bank that has stopped declining - and does not want to wait a day to find
   * out whether it worked. It is the same attempt the sweep would make, taken
   * early: `retryRenewal` rather than `renewSubscription`, because the period
   * is already claimed and re-claiming it would lose its own conflict.
   *
   * **Rate limited hard.** Three an hour. Each press is a real charge
   * presented to a real issuer, and a card presented repeatedly after a
   * decline is a card the issuer starts treating as fraud - so the limit is
   * protecting the customer's credential, not our capacity.
   *
   * **Only a `pending` renewal is retried.** A renewal that is already
   * `collecting` is refused rather than retried: it would be refused anyway,
   * but silently, as an outcome the customer would read as "nothing happened"
   * when in fact their money is moving right now. An `awaiting_action`
   * renewal is refused for a harder reason - `markRenewalCollecting` *would*
   * take it, and the charge that came back would be a second one. See
   * {@link RETRYABLE_RENEWAL_STATUSES}.
   */
  retryNow: protectedProcedure
    .meta({
      ratelimit: {
        requests: 3,
        seconds: "1 h",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `subscription-retry-renewal:${userId || defaultFingerprint}`,
      },
    })
    .input(RetrySubscriptionRenewalInputSchema)
    .output(RetrySubscriptionRenewalOutputSchema)
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.apiKey);

      const { db, userId } = ctx;
      // [!] Authorization: scoped to the caller, and the only reason this read
      // happens before the renewal is looked up at all - `subscription_
      // renewals` carries no `user_id` of its own.
      const subscription = await loadOwnSubscriptionState(db, userId, input.id);

      const renewal = await db
        .select({
          id: subscriptionRenewals.id,
          status: subscriptionRenewals.status,
        })
        .from(subscriptionRenewals)
        .where(eq(subscriptionRenewals.subscriptionId, subscription.id))
        // The newest period. A subscription has at most one renewal row per
        // period - `(subscription_id, period_start)` is unique - so this is
        // the attempt the dashboard is showing and the only one a customer
        // could mean.
        .orderBy(
          desc(subscriptionRenewals.periodStart),
          desc(subscriptionRenewals.id),
        )
        .limit(1)
        .then(([row]) => row);

      if (!renewal) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "There is no renewal to retry.",
        });
      }

      if ("collecting" === renewal.status) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This renewal is being collected right now. Give it a moment.",
        });
      }

      if ("awaiting_action" === renewal.status) {
        // A charge that is live at the provider and waiting on the customer.
        // Retrying is not a second try at the same payment - it is a second
        // payment, because the idempotency key is built from an attempt that
        // authentication does not spend and the provider forgets that key
        // after a day. See `RETRYABLE_RENEWAL_STATUSES`.
        //
        // The customer's own confirmation is what settles this, and if it
        // never comes `reconcileRenewals` closes the window and puts the
        // renewal back on the ladder - so there is a true thing to say and a
        // real action to name, which is what this says instead of "no".
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Your bank still needs you to confirm this payment. Finish that confirmation - starting again here could charge you twice. If you do not, we retry by ourselves once it expires.",
        });
      }

      if (!RETRYABLE_RENEWAL_STATUSES.has(renewal.status)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "succeeded" === renewal.status
              ? "This renewal has already been paid."
              : "This renewal cannot be retried. Add a working payment method and extend the server instead.",
        });
      }

      const { outcome } = await retryRenewal(renewal.id);

      return {
        subscription: await loadOwnSubscription(db, userId, subscription.id),
        outcome: CUSTOMER_FACING_OUTCOMES[outcome],
      };
    }),
} satisfies TRPCRouterRecord;
