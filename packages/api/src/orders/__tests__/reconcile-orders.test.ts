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
 * As in `apply-payment-event.test.ts`: the orders modules bind `db` at import
 * time, so the in-memory Postgres has to be mocked in before they load.
 */
const testDb: TestDb = await createTestDb();

const USER_ID = "usr_00000000000000000000000003";

mock.module("@virtbase/db/client", () => ({ db: testDb }));

/** Every workflow `fulfilOrder` enqueued, and a switch to make it fail. */
const started: string[] = [];
let workflowQueueDown = false;

mock.module("workflow/api", () => ({
  start: async (workflow: { name?: string }) => {
    if (workflowQueueDown) throw new Error("workflow queue unavailable");
    started.push(workflow?.name ?? "anonymous");
  },
}));

const { applyPaymentEvent } = await import("../apply-payment-event");
const { fulfilOrder } = await import("../fulfill-order");
const { reconcileOrders } = await import("../reconcile-orders");
const { claimOrderForFulfilment, transitionOrder } = await import(
  "../transition-order"
);

const BILLING = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  address: {
    line1: "Hauptstraße 1",
    line2: null,
    city: "Berlin",
    postal_code: "10115",
    country: "DE",
  },
};

/** Reconciliation never has to reach a payment provider in these tests. */
const reconcile = (options: Record<string, unknown> = {}) =>
  reconcileOrders({ resolveBillingDetails: async () => BILLING, ...options });

const seedOrder = async () => {
  const [order] = await testDb
    .insert(orders)
    .values({
      userId: USER_ID,
      type: "new_server",
      status: "awaiting_payment",
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

/**
 * Pushes an order's `updatedAt` back so it is outside the grace period. An
 * explicit value wins over the column's `$onUpdate`, so this is exact.
 */
const age = (orderId: string, minutes = 60) =>
  testDb
    .update(orders)
    .set({ updatedAt: new Date(Date.now() - minutes * 60 * 1000) })
    .where(eq(orders.id, orderId));

const statusOf = (orderId: string) =>
  testDb
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .then(([row]) => row?.status);

beforeEach(async () => {
  started.length = 0;
  workflowQueueDown = false;

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

describe("reconcileOrders", () => {
  test("recovers an order whose fulfilment failed and whose event is spent", async () => {
    // The whole reason this exists. The payment settles, fulfilment throws,
    // and the provider redelivers the *same* event id — which is all Stripe
    // ever sends for one intent.
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));

    workflowQueueDown = true;
    await expect(
      fulfilOrder({ orderId, billingDetails: BILLING }),
    ).rejects.toThrow(/workflow queue unavailable/);
    workflowQueueDown = false;

    expect(await statusOf(orderId)).toBe("failed");
    expect(started).toHaveLength(0);

    // The redelivery. Same event, so the idempotency claim short-circuits and
    // the order is on its own: nothing else in the system looks at it.
    const redelivery = await applyPaymentEvent(event(orderId));
    expect(redelivery).toMatchObject({ applied: false, shouldFulfil: false });
    expect(await statusOf(orderId)).toBe("failed");

    await age(orderId);
    expect(await reconcile()).toMatchObject({ examined: 1, fulfilled: 1 });

    expect(await statusOf(orderId)).toBe("fulfilled");
    expect(started).toHaveLength(2);
  });

  test("recovers an order that was paid but never fulfilled at all", async () => {
    // The webhook died between claiming the event and calling `fulfilOrder`.
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));
    await age(orderId);

    expect(await reconcile()).toMatchObject({ examined: 1, fulfilled: 1 });
    expect(await statusOf(orderId)).toBe("fulfilled");
    expect(started).toHaveLength(2);
  });

  test("recovers an order abandoned mid-fulfilment", async () => {
    // The claim was taken and the process went away, so `fulfilling` is a
    // claim nobody holds. Every redelivery is refused by the claim itself.
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));
    expect(await claimOrderForFulfilment(orderId)).toBe(true);
    expect(await claimOrderForFulfilment(orderId)).toBe(false);

    await age(orderId);
    expect(await reconcile()).toMatchObject({ examined: 1, fulfilled: 1 });
    expect(await statusOf(orderId)).toBe("fulfilled");

    // The release is on the record rather than an unexplained state change.
    const transitions = await testDb
      .select()
      .from(orderTransitions)
      .where(eq(orderTransitions.orderId, orderId));

    expect(
      transitions.some(
        (t) => t.toStatus === "failed" && t.actor === "system:reconcile-orders",
      ),
    ).toBe(true);
  });

  test("leaves an order inside the grace period alone", async () => {
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));

    // Not aged: fulfilment may still be running in the request that paid it.
    expect(await reconcile()).toMatchObject({ examined: 0, fulfilled: 0 });
    expect(await statusOf(orderId)).toBe("paid");
    expect(started).toHaveLength(0);
  });

  test("does not fulfil an order that is already fulfilled", async () => {
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));
    await fulfilOrder({ orderId, billingDetails: BILLING });

    expect(await statusOf(orderId)).toBe("fulfilled");
    expect(started).toHaveLength(2);

    await age(orderId);
    expect(await reconcile()).toMatchObject({ examined: 0, fulfilled: 0 });

    expect(await statusOf(orderId)).toBe("fulfilled");
    expect(started).toHaveLength(2);
  });

  test("concurrent reconciliations fulfil exactly once", async () => {
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));
    await age(orderId);

    const runs = await Promise.all([reconcile(), reconcile(), reconcile()]);

    expect(runs.reduce((total, run) => total + run.fulfilled, 0)).toBe(1);
    expect(await statusOf(orderId)).toBe("fulfilled");
    // Two workflows, once — not two per run.
    expect(started).toHaveLength(2);
  });

  test("concurrent reconciliations of an abandoned claim fulfil exactly once", async () => {
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));
    expect(await claimOrderForFulfilment(orderId)).toBe(true);
    await age(orderId);

    const runs = await Promise.all([reconcile(), reconcile(), reconcile()]);

    expect(runs.reduce((total, run) => total + run.fulfilled, 0)).toBe(1);
    expect(await statusOf(orderId)).toBe("fulfilled");
    expect(started).toHaveLength(2);
  });

  test("a stale release is refused rather than tearing out a live fulfilment", async () => {
    // The interleaving two Vercel invocations can produce and one PGlite
    // connection cannot: both runs read the same abandoned `fulfilling` claim,
    // the first releases it and re-claims it, and the second only then reaches
    // its own release. Releasing at that point would hand a live fulfilment's
    // order to a second one and provision two servers for one payment.
    //
    // The guard `reconcileOrders` passes is what refuses it, so it is asserted
    // here at the seam it acts on.
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));
    expect(await claimOrderForFulfilment(orderId)).toBe(true);
    await age(orderId);

    // What the slower run is still holding.
    const stale = await testDb
      .select({ status: orders.status, updatedAt: orders.updatedAt })
      .from(orders)
      .where(eq(orders.id, orderId))
      .then(([row]) => row);
    if (!stale) throw new Error("missing order");

    // The faster run releases the abandoned claim and takes the order on. Its
    // fulfilment is now live, and `updatedAt` has moved.
    const first = await transitionOrder(orderId, "failed", {
      actor: "system:reconcile-orders",
      idempotent: true,
    });
    expect(first.changed).toBe(true);
    expect(await claimOrderForFulfilment(orderId)).toBe(true);
    expect(await statusOf(orderId)).toBe("fulfilling");

    // The slower run reaches its own release. `fulfilling` -> `failed` is a
    // perfectly legal transition, so the guard is the only thing between it
    // and a second server on the same payment.
    const released = await transitionOrder(orderId, "failed", {
      actor: "system:reconcile-orders",
      idempotent: true,
      guard: (current) =>
        current.status === "fulfilling" &&
        current.updatedAt.getTime() === stale.updatedAt.getTime(),
    });

    expect(released.changed).toBe(false);
    expect(await statusOf(orderId)).toBe("fulfilling");

    // And the re-claim reset the clock, so reconciliation leaves it alone too.
    expect(await reconcile()).toMatchObject({ examined: 0 });
  });

  test("the guard lets a genuinely untouched claim go", async () => {
    // The other half: an order nobody has touched since it was read really is
    // abandoned, and the guard must not stand in the way of rescuing it.
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));
    expect(await claimOrderForFulfilment(orderId)).toBe(true);

    const seen = await testDb
      .select({ updatedAt: orders.updatedAt })
      .from(orders)
      .where(eq(orders.id, orderId))
      .then(([row]) => row);
    if (!seen) throw new Error("missing order");

    const released = await transitionOrder(orderId, "failed", {
      idempotent: true,
      guard: (current) =>
        current.updatedAt.getTime() === seen.updatedAt.getTime(),
    });

    expect(released).toMatchObject({ changed: true, status: "failed" });
  });

  test("a late webhook racing reconciliation still fulfils once", async () => {
    const orderId = await seedOrder();
    await applyPaymentEvent(event(orderId));
    await age(orderId);

    const [, viaWebhook] = await Promise.all([
      reconcile(),
      applyPaymentEvent(event(orderId, { eventId: "evt_2" })).then(
        async (result) =>
          result.shouldFulfil
            ? fulfilOrder({ orderId, billingDetails: BILLING }).then(() => true)
            : false,
      ),
    ]);

    expect(await statusOf(orderId)).toBe("fulfilled");
    expect(started).toHaveLength(2);
    expect(viaWebhook === true || viaWebhook === false).toBe(true);
  });

  test("ignores an order marked paid with no settled payment behind it", async () => {
    // `paidAt` is our own bookkeeping. Fulfilling on the strength of it alone
    // would provision a server nobody paid for.
    const orderId = await seedOrder();
    await testDb
      .update(orders)
      .set({
        status: "paid",
        paidAt: new Date(),
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      .where(eq(orders.id, orderId));

    expect(await reconcile()).toMatchObject({ examined: 0 });
    expect(await statusOf(orderId)).toBe("paid");
    expect(started).toHaveLength(0);
  });

  test("never fulfils an order that failed before payment", async () => {
    const orderId = await seedOrder();
    await applyPaymentEvent(
      event(orderId, { type: "payment.failed", failureReason: "declined" }),
    );
    await age(orderId);

    expect(await reconcile()).toMatchObject({ examined: 0 });
    expect(await statusOf(orderId)).toBe("failed");
    expect(started).toHaveLength(0);
  });

  test("keeps going when one order throws, and reports it", async () => {
    const healthy = await seedOrder();
    const broken = await seedOrder();

    await applyPaymentEvent(event(healthy, { eventId: "evt_a" }));
    await applyPaymentEvent(
      event(broken, { eventId: "evt_b", externalId: "pi_2" }),
    );

    // An order type no workflow knows how to fulfil.
    await testDb
      .update(orders)
      .set({ configuration: { version: 2, type: "nonsense" } })
      .where(eq(orders.id, broken));

    await age(broken, 120);
    await age(healthy, 60);

    expect(await reconcile()).toMatchObject({
      examined: 2,
      fulfilled: 1,
      failed: 1,
    });

    expect(await statusOf(broken)).toBe("failed");
    expect(await statusOf(healthy)).toBe("fulfilled");
  });

  test("bounds the batch", async () => {
    for (const eventId of ["evt_a", "evt_b", "evt_c"]) {
      const orderId = await seedOrder();
      await applyPaymentEvent(
        event(orderId, { eventId, externalId: `pi_${eventId}` }),
      );
      await age(orderId);
    }

    expect(await reconcile({ limit: 2 })).toMatchObject({ examined: 2 });
  });
});
