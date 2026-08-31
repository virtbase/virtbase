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

import {
  mockServer,
  mockServerPlanPrice,
  mockSession,
} from "@virtbase/api/testing/fixtures";
import type {
  orders,
  paymentMethods,
  payments,
  subscriptionRenewals,
  subscriptions,
} from "@virtbase/db/schema";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";

export const MONTH = 1000 * 60 * 60 * 24 * 30;

/**
 * A subscription for the seeded customer's seeded server.
 *
 * `autoRenew` is off by default, matching what `createServerSubscriptionStep`
 * writes: nothing existing is enrolled in automatic charging, so a test that
 * wants an enrolled subscription has to say so.
 */
export const insertSubscription = async (
  db: TestDb,
  values: Partial<typeof subscriptions.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      userId: mockSession.user.id,
      subjectId: mockServer.id,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: new Date(Date.now() - MONTH),
      currentPeriodEnd: new Date(Date.now() + MONTH),
      autoRenew: false,
      ...values,
    })
    .returning();

  if (!row) throw new Error("Failed to insert subscription");

  return row;
};

/**
 * A claimed period.
 *
 * `(subscriptionId, periodStart)` is unique — the claim *is* the insert — so a
 * test that wants two of them has to move the period.
 */
export const insertRenewal = async (
  db: TestDb,
  values: Partial<typeof subscriptionRenewals.$inferInsert> & {
    subscriptionId: string;
  },
) => {
  const [row] = await db
    .insert(schema.subscriptionRenewals)
    .values({
      periodStart: new Date(Date.now() + MONTH),
      periodEnd: new Date(Date.now() + 2 * MONTH),
      amount: 3499,
      ...values,
    })
    .returning();

  if (!row) throw new Error("Failed to insert renewal");

  return row;
};

export const insertOrder = async (
  db: TestDb,
  values: Partial<typeof orders.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(schema.orders)
    .values({
      userId: mockSession.user.id,
      type: "extend_server",
      status: "awaiting_payment",
      totalAmount: 3499,
      configuration: {},
      ...values,
    })
    .returning();

  if (!row) throw new Error("Failed to insert order");

  return row;
};

export const insertPayment = async (
  db: TestDb,
  values: Partial<typeof payments.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(schema.payments)
    .values({
      userId: mockSession.user.id,
      provider: "stripe",
      externalId: `pi_${Math.random().toString(36).slice(2)}`,
      amount: 3499,
      ...values,
    })
    .returning();

  if (!row) throw new Error("Failed to insert payment");

  return row;
};

export const insertPaymentMethod = async (
  db: TestDb,
  values: Partial<typeof paymentMethods.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(schema.paymentMethods)
    .values({
      userId: mockSession.user.id,
      provider: "stripe",
      externalId: `pm_${Math.random().toString(36).slice(2)}`,
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      ...values,
    })
    .returning();

  if (!row) throw new Error("Failed to insert payment method");

  return row;
};
