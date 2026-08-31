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

import { sql } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { users } from "./auth";
import { orders } from "./orders";
import { paymentMethods } from "./payment-methods";
import { serverPlanPrices } from "./server-plan-prices";

/**
 * `active → past_due → suspended → ended`, with `cancelled` as the branch the
 * customer takes.
 *
 * `past_due` and `suspended` are separate on purpose: the first means a
 * renewal is failing and the ladder is still climbing, the second means it has
 * run out and the server is off. Collapsing them loses the only window in
 * which a customer can fix their card and keep the machine.
 *
 * `cancelled` is a subscription that will not renew but whose period has not
 * run out yet — the customer keeps what they paid for. `ended` is terminal for
 * every route in, and is the only state a subject may have twice.
 */
export const subscriptionStatusEnum = d.pgEnum("subscription_statuses", [
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "ended",
]);

/**
 * A standing agreement to keep charging for something.
 *
 * Distinct from the thing it pays for. A server carries `terminatesAt` and
 * nothing else, which answers "when does this expire" but never "and then
 * what" — that gap is why renewal has so far been a customer remembering to
 * place an extension order.
 */
export const subscriptions = d.snakeCase.table(
  "subscriptions",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "sub_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** What is being paid for. `server` today; the column exists so the
     * collector never has to be taught a second time. */
    subjectType: d.text().notNull().default("server"),
    /**
     * The subject's id — a `servers.id` while `subjectType` is `server`.
     *
     * Deliberately not a foreign key. A subscription has to outlive its
     * subject: the last renewal, the last invoice and any dispute over either
     * are all about a server that has since been destroyed, and a cascade
     * would take the billing history with the machine. `subjectType` also
     * means the target table is not fixed, which no single reference could
     * express. The cost is that nothing stops a dangling `subjectId`, so
     * readers resolve it and tolerate a miss rather than assuming a row.
     */
    subjectId: d.text().notNull(),
    status: subscriptionStatusEnum().notNull().default("active"),
    /**
     * The price row this subscription was opened against.
     *
     * **Not what a renewal is quoted from.** `resolveServerRenewalPrice` reads
     * the price row currently locked to the *server*, because that is what a
     * manual extension charges and because it follows an upgrade: quoting from
     * the row frozen here would renew an upgraded machine at the plan it left
     * behind, forever. This column is the record of what was agreed at signup,
     * and nothing prices against it.
     *
     * The upgrade workflow does now re-point it, so the two rows agree. It
     * becomes authoritative the day `resolveServerRenewalPrice` reads it
     * instead of the server's, at which point the server's copy can go — that
     * swap is the remaining half of the change and has not been made. Until
     * then: two rows that agree, and a comment saying which one wins, because
     * the day they disagree is the day someone is billed the wrong amount.
     */
    serverPlanPriceId: d
      .text()
      .notNull()
      .references(() => serverPlanPrices.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    /** Billing period length. One month unless the customer bought longer. */
    intervalMonths: d.smallint().notNull().default(1),
    currency: d.text().notNull().default("EUR"),
    currentPeriodStart: d
      .timestamp({ withTimezone: true, mode: "date" })
      .notNull(),
    /**
     * When the paid-for period runs out, and therefore when the next
     * collection is due.
     *
     * Mirrors `servers.terminatesAt` for the server this pays for. The two are
     * written together and the server's copy stays authoritative for the
     * suspension sweep, because that sweep has to keep working for servers
     * with no subscription at all.
     */
    currentPeriodEnd: d
      .timestamp({ withTimezone: true, mode: "date" })
      .notNull(),
    /**
     * Whether the period end triggers a collection or an expiry.
     *
     * Separate from `cancelled`: a customer can turn renewal off without
     * ending anything, and turn it back on before the period runs out with no
     * state change in between.
     */
    autoRenew: d.boolean().notNull().default(true),
    /**
     * The credential to charge. Null means "whatever is default at collection
     * time", which is what a customer who has only ever had one card expects,
     * and what keeps a replaced card working without touching this row.
     */
    paymentMethodId: d.text(),
    /**
     * When the customer agreed that we may charge them without them being
     * present, and against which wording.
     *
     * This is the artefact a dispute is decided on. A merchant-initiated
     * charge with no recorded consent is one the provider will reverse on
     * request, so the version matters as much as the timestamp: "they accepted
     * something" is not a defence, "they accepted this text on this date" is.
     */
    mandateAcceptedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /** Identifier of the mandate wording accepted, e.g. `2026-08-01`. */
    mandateTextVersion: d.text(),
    cancelledAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * Why it stopped.
     *
     * Customer intent: `customer`, `admin`, `abuse`, `dunning_exhausted`.
     * The subject going away: `server_deleted`, `grace_period_elapsed`,
     * `term_elapsed`, `provision_failed`.
     *
     * Free text rather than an enum because the second group grew once the
     * lifecycle was wired and will grow again; the cost is that this comment
     * is the only list, so add to it.
     */
    cancelReason: d.text(),
    /** When the subject actually stopped being paid for. */
    endedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    // A backwards period would make the due-sweep fire immediately and the
    // renewal claim below take a key it can never advance past.
    d.check(
      "subscriptions_period_range",
      sql`${t.currentPeriodEnd} > ${t.currentPeriodStart}`,
    ),
    // One live subscription per subject. Two of them bill the same server
    // twice a month, each unaware of the other, and each extending
    // `terminatesAt` on top of the other's extension. Partial on the terminal
    // state, so a subject that has been let go can be picked up again later
    // rather than being poisoned by its own history.
    d
      .uniqueIndex("subscriptions_subject_live_index")
      .on(t.subjectType, t.subjectId)
      .where(sql`${t.status} <> 'ended'`),
    d.index().on(t.userId),
    // The credential must belong to the customer being charged.
    //
    // A plain reference to `paymentMethods.id` lets any subscription name any
    // card in the table, so a bug that crosses two ids anywhere upstream bills
    // the wrong human — the one failure in this schema worse than billing the
    // right human twice, and the only one nothing else here would catch.
    // Carrying `userId` into the reference makes the pairing the database's
    // problem instead of the caller's.
    //
    // No `onDelete`: the column is nullable, and `SET NULL` on a composite key
    // would take `userId` with it. Nulling `paymentMethodId` alone is safe —
    // MATCH SIMPLE stops enforcing the moment any column of the key is null,
    // which is the whole reason the pointer can be cleared without touching
    // the owner.
    //
    // The consequence is that this constraint has real teeth during a privacy
    // erasure, where `payment_methods` is `erase` but `subscriptions` is
    // `retain`: the two sides do *not* disappear together, so deleting a
    // credential while a retained subscription still names it raises here.
    // `workflows/offboard-user/detach-payment-methods.ts` clears the pointer
    // first for exactly that reason. Anything else that deletes a credential
    // has to do the same.
    d
      .foreignKey({
        columns: [t.paymentMethodId, t.userId],
        foreignColumns: [paymentMethods.id, paymentMethods.userId],
        name: "subscriptions_payment_method_owner_fkey",
      })
      .onUpdate("cascade"),
    // `subjectType` is half of the live-subject unique key, so an untrimmed or
    // misspelled value silently reopens the double-billing hole that index
    // closes. Constrained rather than left as free text until there is a
    // second product to add to it.
    d.check(
      "subscriptions_subject_type_known",
      sql`${t.subjectType} IN ('server')`,
    ),
    // The due-sweep's own predicate. It runs on a schedule against a table
    // that is mostly rows it must not touch — cancelled, ended, renewal turned
    // off — so the index holds only the ones it can act on and the scan stays
    // proportional to what is actually due rather than to how long the
    // business has existed.
    d
      .index()
      .on(t.currentPeriodEnd)
      .where(sql`${t.status} IN ('active', 'past_due') AND ${t.autoRenew}`),
  ],
);

/**
 * `pending → collecting → succeeded`, with `awaiting_action` for a charge the
 * customer has to confirm, `failed` between attempts, and `abandoned` once the
 * ladder is out of rungs.
 *
 * `awaiting_action` is not a failure: 3-D Secure and a SEPA pre-notification
 * both park a renewal for hours or days, and counting that as a decline would
 * suspend a customer who has done nothing wrong.
 */
export const renewalStatusEnum = d.pgEnum("renewal_statuses", [
  "pending",
  "collecting",
  "awaiting_action",
  "succeeded",
  "failed",
  "abandoned",
]);

/**
 * One row per billing period the system has ever tried to collect.
 *
 * **The INSERT is the claim.** `(subscriptionId, periodStart)` is unique, so
 * two workers that both find the same subscription due — the cron overlapping
 * itself, a manual retry racing the sweep, a webhook arriving mid-run — race
 * to insert and exactly one wins. The loser takes a constraint violation and
 * stops. Nothing about this depends on locking, on a queue being
 * exactly-once, or on a worker surviving long enough to clean up after
 * itself; it is the same trick `paymentEvents` plays with
 * `(provider, eventId)`, and for the same reason. The failure it prevents is a
 * customer charged twice for one month, which costs a refund, a chargeback fee
 * and a support thread each time it happens.
 *
 * It is also the record. A period that was attempted and given up on leaves a
 * row behind, so "why was this server not renewed" has an answer that does not
 * involve reading logs.
 */
export const subscriptionRenewals = d.snakeCase.table(
  "subscription_renewals",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "sre_" })),
    subscriptionId: d
      .text()
      .notNull()
      .references(() => subscriptions.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** The period being collected for — the one that starts when the paid-for
     * period ends, not the one just finishing. */
    periodStart: d.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    periodEnd: d.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    /**
     * What the renewal costs, in the smallest currency unit, resolved when the
     * claim was taken.
     *
     * Frozen here rather than read from the price row at each attempt: an
     * attempt on Tuesday must charge what the first attempt on Friday quoted,
     * or a price change lands in the middle of a dunning sequence and the
     * customer is asked for a different number every email.
     */
    amount: d.integer().notNull(),
    currency: d.text().notNull().default("EUR"),
    status: renewalStatusEnum().notNull().default("pending"),
    /**
     * How many times the provider has *declined* this renewal. The dunning
     * ladder steps through this, not through elapsed time.
     *
     * Transport failures never increment it. A provider outage, a timeout, a
     * 500 — none of those say anything about the customer's credential, and
     * letting them consume the ladder means an hour of somebody else's
     * downtime suspends servers whose cards were fine. Those retry against
     * `nextAttemptAt` and leave this alone.
     */
    attempt: d.smallint().notNull().default(0),
    /** When to try again. Null while an attempt is in flight or the renewal is
     * settled. */
    nextAttemptAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The provider's own decline code, stored verbatim.
     *
     * Classification — hard versus retryable, expired versus unfunded —
     * happens in the adapter, where the provider's vocabulary is known.
     * Normalising on the way in throws away every code we did not anticipate,
     * and leaves nothing to go back to when the mapping turns out to be wrong.
     */
    failureCode: d.text(),
    failureMessage: d.text(),
    /**
     * The extension order this renewal produced, once it has one.
     *
     * `set null` rather than cascade: an order can be scrubbed by a privacy
     * erasure, and the renewal history has to survive that with a hole in it
     * rather than disappearing.
     */
    orderId: d.text().references(() => orders.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** When this renewal reached a terminal status, either way. */
    settledAt: d.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    // The whole idempotency story in one line: a subscription has at most one
    // attempt row per period, so claiming a period is an insert and double
    // billing is a constraint violation rather than a postmortem.
    // The same guard `subscriptions_period_range` puts on the subscription.
    // It matters more here: this row is what the collector bills against and
    // what `currentPeriodEnd` is advanced from, so a backwards period would
    // move a customer's term *backwards* after a successful charge.
    d.check(
      "subscription_renewals_period_range",
      sql`${t.periodEnd} > ${t.periodStart}`,
    ),
    // A negative renewal amount is a refund wearing a charge's clothes.
    d.check("subscription_renewals_amount_positive", sql`${t.amount} >= 0`),
    d.unique().on(t.subscriptionId, t.periodStart),
    // The retry sweep's predicate. Every renewal ever attempted stays in this
    // table, so scanning it for the handful that are due again has to be
    // partial or it grows without bound.
    d
      .index()
      .on(t.nextAttemptAt)
      .where(sql`${t.status} IN ('pending', 'awaiting_action')`),
    // Attempts a worker started and never finished. `collecting` is only ever
    // written immediately before calling the provider, so a row that has sat
    // in it is a crashed process, not a slow one — the same shape as the
    // stranded orders `reconcile-orders` picks up, and it needs the same
    // sweep or the subscription is wedged until someone notices.
    d.index().on(t.updatedAt).where(sql`${t.status} = 'collecting'`),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type SubscriptionRenewal = typeof subscriptionRenewals.$inferSelect;
export type SubscriptionStatus = Subscription["status"];
export type RenewalStatus = SubscriptionRenewal["status"];
