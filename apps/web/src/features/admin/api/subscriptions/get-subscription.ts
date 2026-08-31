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

import { and, asc, desc, eq, inArray } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type {
  Order,
  Payment,
  Subscription,
  SubscriptionRenewal,
} from "@virtbase/db/schema";
import {
  orders,
  paymentMethods,
  payments,
  serverPlanPrices,
  serverPlans,
  servers,
  subscriptionRenewals,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import { cache } from "react";
import { verifySession } from "../verify-session";

/** See the note in `get-subscriptions-list.ts`. */
const SERVER_SUBJECT_TYPE = "server";

/**
 * One attempt at collecting one billing period, as an operator reads it.
 *
 * This is the table that answers "why did this not renew", so the provider's
 * own vocabulary is carried through untouched: `failureCode` is exactly what
 * the adapter stored, unmapped and unprettified, because a code we did not
 * anticipate is precisely the one somebody needs to look up.
 */
export interface SubscriptionRenewalRow {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  currency: string;
  status: SubscriptionRenewal["status"];
  /** Declines only. Transport failures never increment it — see the schema. */
  attempt: number;
  nextAttemptAt: Date | null;
  /** The provider's decline code, verbatim. */
  failureCode: string | null;
  failureMessage: string | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * The extension order this renewal produced, if it got that far.
   *
   * Nullable twice over: a renewal that never reached a charge has no order,
   * and `orders` is `set null` on delete so a privacy erasure leaves a hole
   * here rather than taking the renewal history with it.
   */
  order: {
    id: string;
    type: Order["type"];
    status: Order["status"];
    totalAmount: number;
    currency: string;
    paidAt: Date | null;
    failureReason: string | null;
  } | null;
}

/**
 * A charge behind one of those renewals.
 *
 * `externalId` is on this shape deliberately. It is the provider's transaction
 * id — the string support pastes into the Stripe dashboard — and admin is the
 * one surface where showing it is legitimate. It is not a credential: it names
 * a charge that already happened and cannot be used to make another.
 */
export interface SubscriptionPaymentRow {
  id: string;
  orderId: string | null;
  provider: string;
  /** [!] The provider's transaction id. Operators only, never customer-facing. */
  externalId: string;
  status: Payment["status"];
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
  currency: string;
  method: string | null;
  failureReason: string | null;
  createdAt: Date;
}

/**
 * A credential on the customer's file, as display material only.
 *
 * `payment_methods.external_id` is **absent by construction** — it is not
 * selected, so it cannot be rendered by accident. A credential token is not a
 * transaction id: it is the thing an off-session charge is made against, and
 * nobody in support has a reason to hold one.
 */
export interface SubscriptionPaymentMethodRow {
  id: string;
  provider: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  invalidAt: Date | null;
  invalidReason: string | null;
  detachedAt: Date | null;
  createdAt: Date;
  /** True when this is the credential the subscription itself names. */
  named: boolean;
}

export interface SubscriptionDetail {
  id: string;
  status: Subscription["status"];
  subjectType: string;
  subjectId: string;
  /** Null once the server has been destroyed; the subscription outlives it. */
  subjectName: string | null;
  intervalMonths: number;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  autoRenew: boolean;
  mandateAcceptedAt: Date | null;
  /** Which wording was accepted. The other half of a dispute defence. */
  mandateTextVersion: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; email: string; image: string | null };
  /**
   * What was agreed at signup.
   *
   * Named `agreed` rather than `price` on purpose: a renewal is quoted from
   * the price row locked to the *server*, not from this one, so labelling it
   * "the renewal price" would be wrong the day after an upgrade. See the
   * `serverPlanPriceId` comment in the schema.
   */
  agreedPrice: {
    id: string;
    planName: string | null;
    purchasePrice: number;
    renewalPrice: number;
  } | null;
  renewals: SubscriptionRenewalRow[];
  payments: SubscriptionPaymentRow[];
  paymentMethods: SubscriptionPaymentMethodRow[];
}

/**
 * Everything the subscription page renders. Read-only, top to bottom.
 *
 * Scoped by nothing but the id, unlike its customer-facing counterpart: an
 * operator is looking at somebody else's subscription by definition, and
 * {@link verifySession} is what says they may. Returns `null` rather than
 * throwing so the route can `notFound()` — an id typed wrong is not an error
 * worth a stack trace.
 */
export const getSubscription = cache(
  async (subscriptionId: string): Promise<SubscriptionDetail | null> => {
    await verifySession();

    const row = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        subjectType: subscriptions.subjectType,
        subjectId: subscriptions.subjectId,
        subjectName: servers.name,
        intervalMonths: subscriptions.intervalMonths,
        currency: subscriptions.currency,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        autoRenew: subscriptions.autoRenew,
        paymentMethodId: subscriptions.paymentMethodId,
        mandateAcceptedAt: subscriptions.mandateAcceptedAt,
        mandateTextVersion: subscriptions.mandateTextVersion,
        cancelledAt: subscriptions.cancelledAt,
        cancelReason: subscriptions.cancelReason,
        endedAt: subscriptions.endedAt,
        createdAt: subscriptions.createdAt,
        updatedAt: subscriptions.updatedAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
        priceId: serverPlanPrices.id,
        purchasePrice: serverPlanPrices.purchasePrice,
        renewalPrice: serverPlanPrices.renewalPrice,
        planName: serverPlans.name,
      })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .leftJoin(
        servers,
        and(
          eq(subscriptions.subjectType, SERVER_SUBJECT_TYPE),
          eq(subscriptions.subjectId, servers.id),
        ),
      )
      // Left, not inner: the price row is `restrict` on delete so it should
      // always be there, but a detail page that 404s because one join missed is
      // worse than one that renders with a gap.
      .leftJoin(
        serverPlanPrices,
        eq(serverPlanPrices.id, subscriptions.serverPlanPriceId),
      )
      .leftJoin(serverPlans, eq(serverPlans.id, serverPlanPrices.serverPlanId))
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1)
      .then(([first]) => first);

    if (!row) return null;

    const renewalRows = await db
      .select({
        id: subscriptionRenewals.id,
        periodStart: subscriptionRenewals.periodStart,
        periodEnd: subscriptionRenewals.periodEnd,
        amount: subscriptionRenewals.amount,
        currency: subscriptionRenewals.currency,
        status: subscriptionRenewals.status,
        attempt: subscriptionRenewals.attempt,
        nextAttemptAt: subscriptionRenewals.nextAttemptAt,
        failureCode: subscriptionRenewals.failureCode,
        failureMessage: subscriptionRenewals.failureMessage,
        settledAt: subscriptionRenewals.settledAt,
        createdAt: subscriptionRenewals.createdAt,
        updatedAt: subscriptionRenewals.updatedAt,
        orderId: orders.id,
        orderType: orders.type,
        orderStatus: orders.status,
        orderTotal: orders.totalAmount,
        orderCurrency: orders.currency,
        orderPaidAt: orders.paidAt,
        orderFailureReason: orders.failureReason,
      })
      .from(subscriptionRenewals)
      .leftJoin(orders, eq(orders.id, subscriptionRenewals.orderId))
      .where(eq(subscriptionRenewals.subscriptionId, subscriptionId))
      // Newest period first: a "why did this not renew" ticket is always about
      // the most recent attempt, and the history below it is context.
      .orderBy(desc(subscriptionRenewals.periodStart));

    const orderIds = renewalRows
      .map((renewal) => renewal.orderId)
      .filter((id): id is string => id !== null);

    const [paymentRows, methodRows] = await Promise.all([
      // Reached through the orders the renewals produced, because that is the
      // only link there is — `payments` has no subscription column. A renewal
      // that never got as far as an order therefore has no payment, which is
      // itself the answer to some tickets.
      orderIds.length > 0
        ? db
            .select({
              id: payments.id,
              orderId: payments.orderId,
              provider: payments.provider,
              externalId: payments.externalId,
              status: payments.status,
              amount: payments.amount,
              capturedAmount: payments.capturedAmount,
              refundedAmount: payments.refundedAmount,
              currency: payments.currency,
              method: payments.method,
              failureReason: payments.failureReason,
              createdAt: payments.createdAt,
            })
            .from(payments)
            .where(inArray(payments.orderId, orderIds))
            .orderBy(desc(payments.createdAt))
        : Promise.resolve([] as SubscriptionPaymentRow[]),
      // The customer's whole file, detached rows included: a card that was
      // removed last week is often exactly what the failing renewals were
      // presented against.
      //
      // [!] `paymentMethods.externalId` is deliberately not selected.
      db
        .select({
          id: paymentMethods.id,
          provider: paymentMethods.provider,
          type: paymentMethods.type,
          brand: paymentMethods.brand,
          last4: paymentMethods.last4,
          expMonth: paymentMethods.expMonth,
          expYear: paymentMethods.expYear,
          isDefault: paymentMethods.isDefault,
          invalidAt: paymentMethods.invalidAt,
          invalidReason: paymentMethods.invalidReason,
          detachedAt: paymentMethods.detachedAt,
          createdAt: paymentMethods.createdAt,
        })
        .from(paymentMethods)
        .where(eq(paymentMethods.userId, row.userId))
        .orderBy(desc(paymentMethods.isDefault), asc(paymentMethods.createdAt)),
    ]);

    return {
      id: row.id,
      status: row.status,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      intervalMonths: row.intervalMonths,
      currency: row.currency,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      autoRenew: row.autoRenew,
      mandateAcceptedAt: row.mandateAcceptedAt,
      mandateTextVersion: row.mandateTextVersion,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      endedAt: row.endedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      customer: {
        id: row.userId,
        name: row.userName,
        email: row.userEmail,
        image: row.userImage,
      },
      agreedPrice:
        row.priceId === null ||
        row.purchasePrice === null ||
        row.renewalPrice === null
          ? null
          : {
              id: row.priceId,
              planName: row.planName,
              purchasePrice: row.purchasePrice,
              renewalPrice: row.renewalPrice,
            },
      renewals: renewalRows.map(
        ({
          orderId,
          orderType,
          orderStatus,
          orderTotal,
          orderCurrency,
          orderPaidAt,
          orderFailureReason,
          ...renewal
        }) => ({
          ...renewal,
          order:
            orderId === null ||
            orderType === null ||
            orderStatus === null ||
            orderTotal === null ||
            orderCurrency === null
              ? null
              : {
                  id: orderId,
                  type: orderType,
                  status: orderStatus,
                  totalAmount: orderTotal,
                  currency: orderCurrency,
                  paidAt: orderPaidAt,
                  failureReason: orderFailureReason,
                },
        }),
      ),
      payments: paymentRows,
      paymentMethods: methodRows.map((method) => ({
        ...method,
        named: method.id === row.paymentMethodId,
      })),
    };
  },
);
