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
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { eq } from "@virtbase/db";
import {
  datacenters,
  orderItems,
  orders,
  orderTransitions,
  paymentEvents,
  paymentMethods,
  payments,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  subscriptionRenewals,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { getEmailTitle } from "@virtbase/email/translations";
import type { ChargeOffSessionInput, OffSessionResult } from "@virtbase/ports";
import { RENEWAL_SUSPENSION_GRACE_DAYS } from "@virtbase/utils";
import {
  mockServer,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../testing/fixtures";

/**
 * What the customer is actually told, over the real ladder and the real
 * templates.
 *
 * Only the transport is stubbed. Everything above it runs: the recorder writes
 * the rung, the notifier decides what it earns, `getEmailTitle` resolves a
 * real subject out of `packages/email/src/messages`, and each template is
 * built with the values it will be sent with - so a message key that does not
 * exist shows up here as a subject that is a key path rather than a sentence.
 */
const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));

interface SentMail {
  to: string;
  subject: string;
}

const sent: SentMail[] = [];
let mailFails = false;

mock.module("@virtbase/email", () => ({
  sendEmail: async (opts: { to: string; subject: string }) => {
    if (mailFails) throw new Error("the mail provider is down");

    sent.push({ to: opts.to, subject: opts.subject });

    return { data: null, error: null };
  },
  sendBatchEmail: async () => ({ data: null, error: null }),
  EmailDeliveryError: class EmailDeliveryError extends Error {},
}));

mock.module("workflow/api", () => ({ start: async () => {} }));

const { integrations } = await import("../../integrations");
const { renewSubscription, retryRenewal } = await import(
  "../renew-subscription"
);
const { recordCollectionResult } = await import("../record-outcome");
const { renewalSuspensionDate } = await import("../dunning-mail");
const { nextRenewalAttemptAt } = await import("../retry-schedule");

const USER_ID = mockSession.user.id;
const SERVER_ID = mockServer.id;
const PERIOD_START = new Date("2020-05-31T09:00:00.000Z");
const PERIOD_END = new Date("2020-06-30T09:00:00.000Z");

/** A retryable decline: the ordinary case the ladder exists for. */
const DECLINED: OffSessionResult = {
  status: "failed",
  externalId: "pi_declined",
  code: "insufficient_funds",
  retryable: true,
  message: "Your card has insufficient funds.",
};

let respond: (input: ChargeOffSessionInput) => Promise<OffSessionResult> =
  async () => DECLINED;

spyOn(integrations, "resolve").mockResolvedValue({
  method: "stripe",
  createPayment: async () => {
    throw new Error("not part of this surface");
  },
  retrievePayment: async () => {
    throw new Error("not part of this surface");
  },
  verifyWebhook: async () => null,
  chargeOffSession: async (input: ChargeOffSessionInput) => respond(input),
} as never);

/**
 * The consent every collectable subscription carries.
 *
 * `claimRenewal` refuses `auto_renew` with no mandate on file - a
 * merchant-initiated charge with no recorded agreement is one the provider
 * reverses on request - so a fixture without this is not a subscription the
 * collector will ever act on.
 */
const MANDATE_ACCEPTED_AT = new Date("2020-05-01T09:00:00.000Z");

const subscribe = async () => {
  const [row] = await testDb
    .insert(subscriptions)
    .values({
      userId: USER_ID,
      subjectId: SERVER_ID,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      mandateAcceptedAt: MANDATE_ACCEPTED_AT,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");

  await testDb.insert(paymentMethods).values({
    userId: USER_ID,
    provider: "stripe",
    externalId: "pm_stripe_default",
    type: "card",
    brand: "visa",
    last4: "4242",
    isDefault: true,
  });

  return row;
};

const readRenewal = (id: string) =>
  testDb
    .select()
    .from(subscriptionRenewals)
    .where(eq(subscriptionRenewals.id, id))
    .limit(1)
    .then(([row]) => {
      if (!row) throw new Error(`renewal ${id} disappeared`);
      return row;
    });

/** The first attempt, declined. Leaves the renewal on rung one. */
const firstDecline = async () => {
  const subscription = await subscribe();
  const result = await renewSubscription(subscription.id);

  if (!result.renewalId) throw new Error("expected a claimed renewal");

  return { subscription, renewalId: result.renewalId };
};

beforeEach(async () => {
  sent.length = 0;
  mailFails = false;
  respond = async () => DECLINED;

  await testDb.delete(paymentEvents);
  await testDb.delete(payments);
  await testDb.delete(subscriptionRenewals);
  await testDb.delete(subscriptions);
  await testDb.delete(orderItems);
  await testDb.delete(orderTransitions);
  await testDb.delete(orders);
  await testDb.delete(paymentMethods);
  await testDb.delete(servers);
  await testDb.delete(serverPlanPrices);
  await testDb.delete(serverPlans);
  await testDb.delete(proxmoxNodes);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(datacenters);
  await testDb.delete(users);

  await seedServerGraph(testDb);
});

/**
 * `mock.module` outlives this file, so a mail transport left in its failing
 * state would follow the other billing suites into their runs and turn every
 * decline they record into a swallowed exception in the log.
 */
afterEach(() => {
  mailFails = false;
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("the first decline", () => {
  test("sends exactly one mail, to the customer", async () => {
    const { renewalId } = await firstDecline();

    expect((await readRenewal(renewalId)).attempt).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(mockSession.user.email);
    expect(sent[0]?.subject).toBe("We couldn't take payment for your server");
  });

  test("does not send again when the same rung is recorded twice", async () => {
    const { renewalId } = await firstDecline();
    expect(sent).toHaveLength(1);

    // A redelivered webhook, or a reconcile pass that found the same answer:
    // the row is no longer `collecting`, so the recorder refuses to write and
    // the notifier never runs. `(renewal id, attempt)` is the key, and it is
    // the row itself rather than anything this test arranges.
    const again = await recordCollectionResult(renewalId, {
      result: DECLINED,
      paymentMethod: null,
      idempotencyKey: null,
    });

    expect(again.outcome).toBe("superseded");
    expect(sent).toHaveLength(1);
    expect((await readRenewal(renewalId)).attempt).toBe(1);
  });
});

describe("the middle of the ladder", () => {
  test("says nothing on the second and third rungs", async () => {
    const { renewalId } = await firstDecline();
    sent.length = 0;

    const second = await retryRenewal(renewalId);
    const third = await retryRenewal(renewalId);

    expect(second.attempt).toBe(2);
    expect(third.attempt).toBe(3);
    expect(sent).toHaveLength(0);
  });
});

describe("the last rung", () => {
  test("sends the final warning while there is still an attempt to come", async () => {
    const { renewalId } = await firstDecline();
    await retryRenewal(renewalId);
    await retryRenewal(renewalId);
    sent.length = 0;

    const fourth = await retryRenewal(renewalId);

    expect(fourth.outcome).toBe("retry_scheduled");
    expect(fourth.attempt).toBe(4);
    expect(fourth.nextAttemptAt).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("will be suspended on");
  });

  test("says nothing more when that attempt exhausts the ladder", async () => {
    const { renewalId } = await firstDecline();
    await retryRenewal(renewalId);
    await retryRenewal(renewalId);
    await retryRenewal(renewalId);
    sent.length = 0;

    const exhausted = await retryRenewal(renewalId);

    // The warning has been sent and the suspension mail is the next contact.
    // A second warning arriving as the machine goes off says nothing the
    // customer can still act on.
    expect(exhausted.outcome).toBe("exhausted");
    expect(sent).toHaveLength(0);
  });
});

describe("the date the final warning names", () => {
  const DAY = 24 * 60 * 60 * 1000;

  /**
   * Where the ladder really runs out, walked exactly as the retry sweep walks
   * it: each decline schedules the next rung from the moment it happened, and
   * the rung that schedules nothing is the last charge there will ever be.
   *
   * Derived rather than written down, so this test keeps agreeing with
   * `RENEWAL_RETRY_SCHEDULE_DAYS` if the schedule is ever changed.
   */
  const ladderExhaustsAt = (periodStart: Date): Date => {
    let at = periodStart;

    for (let attempt = 1; attempt <= 100; attempt++) {
      const next = nextRenewalAttemptAt(attempt, at);
      if (!next) return at;
      at = next;
    }

    throw new Error("the ladder does not terminate");
  };

  test("is the day the ladder actually exhausts", () => {
    expect(renewalSuspensionDate(PERIOD_END)).toEqual(
      ladderExhaustsAt(PERIOD_END),
    );
  });

  test("is not the suspension backstop, which is a day later", () => {
    // `RENEWAL_SUSPENSION_GRACE_DAYS` is `max(schedule) + 1`: the backstop for
    // a subscription the ladder has *not* finished with. Quoting it told the
    // customer they had until +8d while the last rung suspended them at +7d,
    // so they lost the server a day before the date in their own warning.
    const backstop = new Date(
      PERIOD_END.getTime() + RENEWAL_SUSPENSION_GRACE_DAYS * DAY,
    );

    expect(renewalSuspensionDate(PERIOD_END)).not.toEqual(backstop);
    expect(renewalSuspensionDate(PERIOD_END).getTime()).toBeLessThan(
      backstop.getTime(),
    );
  });

  test("is the date the customer is shown, through the real subject line", async () => {
    const { renewalId } = await firstDecline();
    await retryRenewal(renewalId);
    await retryRenewal(renewalId);
    sent.length = 0;

    // The rung that schedules the last attempt, which is the one that earns
    // the warning.
    await retryRenewal(renewalId);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe(
      await getEmailTitle("renewal-final-warning", null, {
        date: ladderExhaustsAt(PERIOD_END),
      }),
    );
    expect(sent[0]?.subject).not.toBe(
      await getEmailTitle("renewal-final-warning", null, {
        date: new Date(
          PERIOD_END.getTime() + RENEWAL_SUSPENSION_GRACE_DAYS * DAY,
        ),
      }),
    );
  });
});

describe("a decline that can never come good", () => {
  test("warns immediately, once, because no attempt will follow", async () => {
    const subscription = await subscribe();
    respond = async () => ({
      status: "failed",
      externalId: "pi_stolen",
      code: "stolen_card",
      retryable: false,
      message: "The card was reported stolen.",
    });

    const result = await renewSubscription(subscription.id);

    expect(result.outcome).toBe("no_retries");
    // `stolen_card` also kills the credential, so both the ladder mail and the
    // expiry notice are in play. Exactly one goes out, and it is the one that
    // carries the deadline.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("will be suspended on");
  });
});

describe("a transport failure", () => {
  test("sends nothing at all", async () => {
    const subscription = await subscribe();
    respond = async () => {
      throw new Error("the payment provider could not be reached");
    };

    const result = await renewSubscription(subscription.id);

    // Nothing about the customer's card has gone wrong. Telling them their
    // payment failed because our provider was down is false and alarming.
    // Asserted first, and on its own: this is the whole point of the test, and
    // it must fail here rather than incidentally on the outcome below.
    expect(sent).toHaveLength(0);

    // The rung is not spent either.
    const renewal = await readRenewal(result.renewalId ?? "");
    expect(result.outcome).toBe("rescheduled");
    expect(renewal.attempt).toBe(0);
  });
});

describe("a credential that dies on a silent rung", () => {
  test("earns the expiry notice, and only ever one of them", async () => {
    const { renewalId } = await firstDecline();
    expect(sent).toHaveLength(1);
    sent.length = 0;

    respond = async () => ({
      status: "failed",
      externalId: "pi_expired",
      code: "expired_card",
      retryable: true,
      message: "The card has expired.",
    });

    // Rung two is otherwise silent, but the card has just been marked dead and
    // the customer would otherwise hear nothing about it.
    await retryRenewal(renewalId);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("Your payment method needs replacing");

    const [card] = await testDb.select().from(paymentMethods);
    expect(card?.invalidAt).not.toBeNull();
    expect(card?.invalidReason).toBe("expired_card");

    sent.length = 0;

    // Rung three refuses locally against the same dead credential. The card
    // was already marked, so no second notice goes out.
    await retryRenewal(renewalId);

    expect(sent).toHaveLength(0);
  });
});

describe("a mail outage", () => {
  test("does not fail the renewal or change what it recorded", async () => {
    const subscription = await subscribe();
    mailFails = true;

    const result = await renewSubscription(subscription.id);
    const renewal = await readRenewal(result.renewalId ?? "");

    expect(result.outcome).toBe("retry_scheduled");
    expect(renewal.status).toBe("pending");
    expect(renewal.attempt).toBe(1);
    expect(renewal.nextAttemptAt).not.toBeNull();
    expect(renewal.failureCode).toBe("insufficient_funds");
  });
});
