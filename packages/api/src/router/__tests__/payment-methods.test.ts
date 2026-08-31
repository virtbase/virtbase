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
  beforeAll,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { TRPCError } from "@trpc/server";
import type { Session } from "@virtbase/auth";
import { eq } from "@virtbase/db";
import { paymentMethods, users } from "@virtbase/db/schema";
import { integrations } from "../../integrations";
import { appRouter } from "../../root";
import type { TestCaller, TestCallerResult } from "../../testing";
import { createTestCaller, mockSession } from "../../testing";

const USER_A = mockSession.user.id;
const USER_B = "usr_0000000000000000000000001";

let harness: TestCallerResult;
let testDb: TestCallerResult["db"];
let caller: TestCaller;
/** The other customer, whose credentials must be untouchable from `caller`. */
let otherCaller: TestCaller;
/** Authenticates the way the public API does: a key in the header, no session. */
let apiKeyCaller: TestCaller;

const sessionB = {
  session: { ...mockSession.session, id: "sess_0000000000000000000000001" },
  user: {
    ...mockSession.user,
    id: USER_B,
    email: "other@example.com",
    name: "Other User",
  },
} satisfies Session;

/**
 * A payment provider reduced to the two optional methods this router uses.
 * Each hook can be swapped per test to simulate a refusal.
 */
const fakeProvider = {
  method: "stripe",
  createPayment: async () => {
    throw new Error("not part of this surface");
  },
  retrievePayment: async () => {
    throw new Error("not part of this surface");
  },
  verifyWebhook: async () => null,
  createSetupSession: async () => ({ clientSecret: "seti_secret_test" }),
  detachPaymentMethod: async (_externalId: string) => {},
};

const resolveTo = (provider: unknown) =>
  spyOn(integrations, "resolve").mockResolvedValue(provider as never);

const insertMethod = async (
  values: Partial<typeof paymentMethods.$inferInsert> & { userId: string },
) => {
  const row = await testDb
    .insert(paymentMethods)
    .values({
      provider: "stripe",
      externalId: `pm_stripe_${Math.random().toString(36).slice(2)}`,
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      ...values,
    })
    .returning()
    .then(([created]) => created ?? null);

  if (!row) throw new Error("Failed to insert payment method");

  return row;
};

const readRow = (id: string) =>
  testDb
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.id, id))
    .limit(1)
    .then(([row]) => row ?? null);

beforeAll(async () => {
  harness = await createTestCaller();
  ({ db: testDb, caller } = harness);

  await testDb
    .insert(users)
    .values([mockSession.user, sessionB.user])
    .onConflictDoNothing();

  const sharedContext = {
    db: testDb as never,
    headers: harness.headers,
    setHeader: () => {},
  };

  otherCaller = appRouter.createCaller({
    ...sharedContext,
    authApi: {} as never,
    apiKey: null,
    session: sessionB,
  });

  apiKeyCaller = appRouter.createCaller({
    ...sharedContext,
    authApi: {
      verifyApiKey: async () => ({
        valid: true,
        error: null,
        key: { referenceId: USER_A },
      }),
    } as never,
    apiKey: "vb_test_key",
    session: null,
  });
});

afterAll(async () => {
  await harness.close();
});

afterEach(async () => {
  await testDb.delete(paymentMethods);
  mock.restore();
});

describe("paymentMethods.list", () => {
  test("it returns the caller's live credentials, default first then newest", async () => {
    const older = await insertMethod({
      userId: USER_A,
      last4: "1111",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const newer = await insertMethod({
      userId: USER_A,
      last4: "2222",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    const preferred = await insertMethod({
      userId: USER_A,
      last4: "3333",
      isDefault: true,
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });

    const list = await caller.paymentMethods.list();

    expect(list.payment_methods.map((m) => m.id)).toEqual([
      preferred.id,
      newer.id,
      older.id,
    ]);
  });

  test("it never returns the provider or its credential token", async () => {
    await insertMethod({ userId: USER_A, externalId: "pm_stripe_secret" });

    const list = await caller.paymentMethods.list();
    const [method] = list.payment_methods;

    expect(method).toBeDefined();
    // The token an off-session charge is made against must not reach a client.
    expect(JSON.stringify(list)).not.toContain("pm_stripe_secret");
    expect(JSON.stringify(list)).not.toContain("stripe");
    expect(Object.keys(method ?? {}).sort()).toEqual([
      "brand",
      "exp_month",
      "exp_year",
      "id",
      "invalid_at",
      "invalid_reason",
      "is_default",
      "last4",
      "type",
    ]);
  });

  test("it excludes detached credentials and other customers' rows", async () => {
    await insertMethod({ userId: USER_A, detachedAt: new Date() });
    await insertMethod({ userId: USER_B });

    const list = await caller.paymentMethods.list();

    expect(list.payment_methods).toEqual([]);
  });
});

describe("paymentMethods.setDefault", () => {
  test("it clears the previous default and promotes the requested one", async () => {
    const previous = await insertMethod({ userId: USER_A, isDefault: true });
    const next = await insertMethod({ userId: USER_A });

    const result = await caller.paymentMethods.setDefault({ id: next.id });

    expect(result.payment_method.id).toBe(next.id);
    expect(result.payment_method.is_default).toBe(true);
    expect((await readRow(previous.id))?.isDefault).toBe(false);
  });

  test("it cannot set another customer's credential as default", async () => {
    const theirs = await insertMethod({ userId: USER_B });

    await expect(
      caller.paymentMethods.setDefault({ id: theirs.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    // Not merely refused - untouched. The other customer still owns it.
    expect((await readRow(theirs.id))?.userId).toBe(USER_B);
    expect((await readRow(theirs.id))?.isDefault).toBe(false);
  });

  test("neither customer can promote the other's credential", async () => {
    const mine = await insertMethod({ userId: USER_A });

    await expect(
      otherCaller.paymentMethods.setDefault({ id: mine.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    expect((await readRow(mine.id))?.isDefault).toBe(false);
  });

  test("a miss rolls back rather than leaving the customer with no default", async () => {
    // The clear has to run before the set, so a bogus id must take the whole
    // transaction with it - otherwise a typo silently stops renewals.
    const existing = await insertMethod({ userId: USER_A, isDefault: true });
    const theirs = await insertMethod({ userId: USER_B });

    await expect(
      caller.paymentMethods.setDefault({ id: theirs.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    expect((await readRow(existing.id))?.isDefault).toBe(true);
  });

  test("it refuses a detached credential", async () => {
    const detached = await insertMethod({
      userId: USER_A,
      detachedAt: new Date(),
    });

    await expect(
      caller.paymentMethods.setDefault({ id: detached.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));
  });
});

describe("paymentMethods.remove", () => {
  test("it detaches at the provider before soft-deleting the row", async () => {
    const method = await insertMethod({
      userId: USER_A,
      externalId: "pm_stripe_detach_me",
      isDefault: true,
    });

    const detachPaymentMethod = mock(async (_externalId: string) => {});
    resolveTo({ ...fakeProvider, detachPaymentMethod });

    await caller.paymentMethods.remove({ id: method.id });

    expect(detachPaymentMethod).toHaveBeenCalledWith("pm_stripe_detach_me");

    const row = await readRow(method.id);
    expect(row?.detachedAt).toBeInstanceOf(Date);
    // The default is not handed to another card behind the customer's back.
    expect(row?.isDefault).toBe(false);
    expect((await caller.paymentMethods.list()).payment_methods).toEqual([]);
  });

  test("it does not detach locally when the provider call throws", async () => {
    const method = await insertMethod({ userId: USER_A });

    const detachPaymentMethod = mock(async (_externalId: string) => {
      throw new Error("Stripe is unreachable");
    });
    resolveTo({ ...fakeProvider, detachPaymentMethod });

    await expect(
      caller.paymentMethods.remove({ id: method.id }),
    ).rejects.toThrow(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }));

    expect(detachPaymentMethod).toHaveBeenCalled();

    // A hidden row over a still-chargeable credential is the outcome the
    // ordering exists to prevent: the row stays visible and retryable.
    const row = await readRow(method.id);
    expect(row?.detachedAt).toBeNull();
    expect((await caller.paymentMethods.list()).payment_methods).toHaveLength(
      1,
    );
  });

  test("it does not detach locally when the provider cannot detach at all", async () => {
    const method = await insertMethod({ userId: USER_A });

    // `detachPaymentMethod` is optional on the port. Anonpay has nothing to
    // detach, so reading the method off the object and calling it would be a
    // TypeError at the end of a customer action.
    const { detachPaymentMethod: _omitted, ...withoutDetach } = fakeProvider;
    resolveTo(withoutDetach);

    await expect(
      caller.paymentMethods.remove({ id: method.id }),
    ).rejects.toThrow(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }));

    expect((await readRow(method.id))?.detachedAt).toBeNull();
  });

  test("it does not detach locally when no provider is enabled", async () => {
    const method = await insertMethod({ userId: USER_A });

    resolveTo(null);

    await expect(
      caller.paymentMethods.remove({ id: method.id }),
    ).rejects.toThrow(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }));

    expect((await readRow(method.id))?.detachedAt).toBeNull();
  });

  test("it cannot remove another customer's credential", async () => {
    const theirs = await insertMethod({ userId: USER_B });

    const detachPaymentMethod = mock(async (_externalId: string) => {});
    resolveTo({ ...fakeProvider, detachPaymentMethod });

    await expect(
      caller.paymentMethods.remove({ id: theirs.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    // The provider is never reached, so the other customer's card is not even
    // detached at Stripe on the way to being refused here.
    expect(detachPaymentMethod).not.toHaveBeenCalled();
    expect((await readRow(theirs.id))?.detachedAt).toBeNull();
  });
});

describe("paymentMethods.createSetupSession", () => {
  test("it returns the client secret the browser confirms against", async () => {
    resolveTo(fakeProvider);

    const session = await caller.paymentMethods.createSetupSession();

    expect(session.client_secret).toBe("seti_secret_test");
  });

  test("it fails when the provider returns no client secret", async () => {
    resolveTo({ ...fakeProvider, createSetupSession: async () => ({}) });

    await expect(caller.paymentMethods.createSetupSession()).rejects.toThrow(
      new TRPCError({ code: "INTERNAL_SERVER_ERROR" }),
    );
  });

  test("it fails when the provider cannot start one", async () => {
    const { createSetupSession: _omitted, ...withoutSetup } = fakeProvider;
    resolveTo(withoutSetup);

    await expect(caller.paymentMethods.createSetupSession()).rejects.toThrow(
      new TRPCError({ code: "INTERNAL_SERVER_ERROR" }),
    );
  });
});

describe("API key authentication", () => {
  /**
   * These procedures declare no `permissions`, so the auth middleware refuses a
   * key before the handler runs; each mutation then repeats the check the way
   * `checkout.order` does. A leaked key that can attach or charge a saved card
   * is a materially worse incident than one that can only read, so the refusal
   * is asserted rather than assumed.
   */
  test("a key cannot start a setup session", async () => {
    resolveTo(fakeProvider);

    await expect(
      apiKeyCaller.paymentMethods.createSetupSession(),
    ).rejects.toThrow(new TRPCError({ code: "FORBIDDEN" }));
  });

  test("a key cannot change the default", async () => {
    const method = await insertMethod({ userId: USER_A });

    await expect(
      apiKeyCaller.paymentMethods.setDefault({ id: method.id }),
    ).rejects.toThrow(new TRPCError({ code: "FORBIDDEN" }));

    expect((await readRow(method.id))?.isDefault).toBe(false);
  });

  test("a key cannot remove a credential", async () => {
    const method = await insertMethod({ userId: USER_A });

    const detachPaymentMethod = mock(async (_externalId: string) => {});
    resolveTo({ ...fakeProvider, detachPaymentMethod });

    await expect(
      apiKeyCaller.paymentMethods.remove({ id: method.id }),
    ).rejects.toThrow(new TRPCError({ code: "FORBIDDEN" }));

    expect(detachPaymentMethod).not.toHaveBeenCalled();
    expect((await readRow(method.id))?.detachedAt).toBeNull();
  });

  test("a key cannot read them either", async () => {
    await insertMethod({ userId: USER_A });

    await expect(apiKeyCaller.paymentMethods.list()).rejects.toThrow(
      new TRPCError({ code: "FORBIDDEN" }),
    );
  });
});

describe("authentication", () => {
  test("an unauthenticated caller is refused", async () => {
    await expect(
      harness.unauthenticatedCaller.paymentMethods.list(),
    ).rejects.toThrow(new TRPCError({ code: "UNAUTHORIZED" }));
  });
});
