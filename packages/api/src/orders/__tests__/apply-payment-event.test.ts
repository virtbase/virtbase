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

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  orders,
  orderTransitions,
  paymentEvents,
  payments,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

/**
 * The orders modules bind `db` at import time, so the in-memory Postgres has to
 * exist and be mocked in before they load — hence the top-level await and the
 * dynamic import below.
 */
const testDb: TestDb = await createTestDb();

const USER_ID = "usr_00000000000000000000000001";

mock.module("@virtbase/db/client", () => ({ db: testDb }));

const { applyPaymentEvent } = await import("../apply-payment-event");

const seedOrder = async (
  status: "awaiting_payment" | "paid" = "awaiting_payment",
) => {
  const [order] = await testDb
    .insert(orders)
    .values({
      userId: USER_ID,
      type: "new_server",
      status,
      totalAmount: 1_990,
      configuration: {
        version: 2,
        type: "new_server",
        server_plan_id: "pck_1",
        server_plan_price_id: "price_1",
        template_id: "temp_1",
      },
    })
    .returning({ id: orders.id });

  if (!order) throw new Error("failed to seed order");
  return order.id;
};

const event = (orderId: string, overrides: Record<string, unknown> = {}) => ({
  eventId: "evt_1",
  provider: "stripe",
  type: "payment.succeeded" as const,
  externalId: "pi_1",
  orderId,
  userId: USER_ID,
  amount: 1_990,
  ...overrides,
});

beforeEach(async () => {
  // One database for the file; wiped between tests for isolation.
  await testDb.delete(paymentEvents);
  await testDb.delete(payments);
  await testDb.delete(orderTransitions);
  await testDb.delete(orders);
  await testDb.delete(users);

  await testDb.insert(users).values({
    id: USER_ID,
    name: "Test",
    email: "test@example.com",
    emailVerified: true,
  } as never);
});

describe("applyPaymentEvent", () => {
  test("marks the order paid and asks for fulfilment", async () => {
    const orderId = await seedOrder();

    const result = await applyPaymentEvent(event(orderId));

    expect(result).toMatchObject({ applied: true, shouldFulfil: true });

    const order = await testDb
      .select({ status: orders.status, paidAt: orders.paidAt })
      .from(orders)
      .where(eq(orders.id, orderId))
      .then(([row]) => row);

    expect(order?.status).toBe("paid");
    expect(order?.paidAt).not.toBeNull();
  });

  test("records the payment against the order", async () => {
    const orderId = await seedOrder();

    await applyPaymentEvent(event(orderId));

    const payment = await testDb
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .then(([row]) => row);

    expect(payment).toMatchObject({
      provider: "stripe",
      externalId: "pi_1",
      status: "succeeded",
      amount: 1_990,
      capturedAmount: 1_990,
      refundedAmount: 0,
    });
  });

  test("a redelivered event does not fulfil twice", async () => {
    // The case that would otherwise provision a second server.
    const orderId = await seedOrder();

    const first = await applyPaymentEvent(event(orderId));
    const second = await applyPaymentEvent(event(orderId));

    expect(first.shouldFulfil).toBe(true);
    expect(second).toMatchObject({ applied: false, shouldFulfil: false });

    const rows = await testDb
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.eventId, "evt_1"));
    expect(rows).toHaveLength(1);
  });

  test("concurrent deliveries of the same event fulfil once", async () => {
    const orderId = await seedOrder();

    const results = await Promise.all([
      applyPaymentEvent(event(orderId)),
      applyPaymentEvent(event(orderId)),
      applyPaymentEvent(event(orderId)),
    ]);

    expect(results.filter((r) => r.shouldFulfil)).toHaveLength(1);
  });

  test("two distinct events on one order still fulfil only once", async () => {
    // Stripe can emit more than one succeeded event for an intent; only the
    // one that actually moves the order should start work.
    const orderId = await seedOrder();

    const first = await applyPaymentEvent(event(orderId));
    const second = await applyPaymentEvent(
      event(orderId, { eventId: "evt_2" }),
    );

    expect(first.shouldFulfil).toBe(true);
    expect(second.applied).toBe(true);
    expect(second.shouldFulfil).toBe(false);
  });

  test("an event arriving after the order moved on does not rewind it", async () => {
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));

    // Order progresses past `paid`.
    await testDb
      .update(orders)
      .set({ status: "fulfilled" })
      .where(eq(orders.id, orderId));

    const late = await applyPaymentEvent(event(orderId, { eventId: "evt_3" }));

    expect(late.shouldFulfil).toBe(false);
    const order = await testDb
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .then(([row]) => row);
    expect(order?.status).toBe("fulfilled");
  });

  test("a failed payment fails the order and does not fulfil", async () => {
    const orderId = await seedOrder();

    const result = await applyPaymentEvent(
      event(orderId, {
        type: "payment.failed",
        failureReason: "card_declined",
      }),
    );

    expect(result.shouldFulfil).toBe(false);

    const order = await testDb
      .select({ status: orders.status, failureReason: orders.failureReason })
      .from(orders)
      .where(eq(orders.id, orderId))
      .then(([row]) => row);

    expect(order?.status).toBe("failed");
    expect(order?.failureReason).toBe("card_declined");
  });

  test("records a transition for every change", async () => {
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));

    const transitions = await testDb
      .select()
      .from(orderTransitions)
      .where(eq(orderTransitions.orderId, orderId));

    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      fromStatus: "awaiting_payment",
      toStatus: "paid",
      actor: "provider:stripe",
    });
  });

  test("refuses an event for an order that does not exist", async () => {
    await expect(
      applyPaymentEvent(event("ord_does_not_exist")),
    ).rejects.toThrow(/does not exist/);
  });
});
