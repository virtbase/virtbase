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
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { eq } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockServer,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../../testing/fixtures";

let db: TestDb;
let create: typeof import("../create-server-subscription").createServerSubscriptionStep;
let rollback: typeof import("../create-server-subscription").rollbackCreateServerSubscriptionStep;

const SERVER_ID = mockServer.id;
const TERM_START = new Date("2026-01-15T09:14:03.000Z");
const TERM_END = new Date("2026-02-15T09:14:03.000Z");

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));
  ({
    createServerSubscriptionStep: create,
    rollbackCreateServerSubscriptionStep: rollback,
  } = await import("../create-server-subscription"));

  await seedServerGraph(db);
});

afterAll(async () => {
  await db.$client.close();
});

beforeEach(async () => {
  await db.delete(schema.subscriptionRenewals);
  await db.delete(schema.subscriptions);
  await db
    .update(schema.servers)
    .set({ installedAt: TERM_START, terminatesAt: TERM_END })
    .where(eq(schema.servers.id, SERVER_ID));
});

const live = () =>
  db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.subjectId, SERVER_ID))
    .then(([row]) => row);

describe("createServerSubscriptionStep", () => {
  test("a provisioned server gets a subscription that cannot charge anybody", async () => {
    // [!] The point of the whole step. Buying a server is not consent to be
    // charged while not present, so `autoRenew` is false and there is no
    // mandate on the row - and `claimRenewal` skips a subscription whose
    // `autoRenew` is false, so nothing downstream can act on this.
    await create({ serverId: SERVER_ID });

    const subscription = await live();

    expect(subscription?.autoRenew).toBe(false);
    expect(subscription?.mandateAcceptedAt).toBeNull();
    expect(subscription?.mandateTextVersion).toBeNull();
    expect(subscription?.status).toBe("active");
    expect(subscription?.userId).toBe(mockSession.user.id);
    expect(subscription?.subjectType).toBe("server");
    expect(subscription?.serverPlanPriceId).toBe(mockServerPlanPrice.id);
  });

  test("the period agrees with the server's own term from the first moment", async () => {
    await create({ serverId: SERVER_ID });

    const subscription = await live();

    expect(subscription?.currentPeriodStart?.toISOString()).toBe(
      TERM_START.toISOString(),
    );
    expect(subscription?.currentPeriodEnd?.toISOString()).toBe(
      TERM_END.toISOString(),
    );
  });

  test("a replayed step adopts the row the first run wrote", async () => {
    // Provisioning is durable: a step that committed and lost its
    // acknowledgement is re-run. Two live subscriptions against one server
    // would bill the customer twice a month, each unaware of the other.
    const first = await create({ serverId: SERVER_ID });
    const second = await create({ serverId: SERVER_ID });

    expect(second.id).toBe(first.id);
    expect(
      await db.$count(
        schema.subscriptions,
        eq(schema.subscriptions.subjectId, SERVER_ID),
      ),
    ).toBe(1);
  });

  test("a server whose row has gone gets no subscription", async () => {
    const result = await create({ serverId: "kvm_0000000000000000000000999" });

    expect(result.id).toBeNull();
    expect(await live()).toBeUndefined();
  });
});

describe("rollbackCreateServerSubscriptionStep", () => {
  test("a provision that failed leaves no live subscription behind", async () => {
    // `rollbackStoreProvisionedServerStep` deletes the server row and
    // `subject_id` is not a foreign key, so without this the failed provision
    // strands a subscription pointing at nothing.
    await create({ serverId: SERVER_ID });

    await rollback({ serverId: SERVER_ID });

    const subscription = await live();

    expect(subscription?.status).toBe("ended");
    expect(subscription?.cancelReason).toBe("provision_failed");
    expect(subscription?.endedAt).not.toBeNull();
  });

  test("running the compensation twice is a no-op", async () => {
    await create({ serverId: SERVER_ID });

    await rollback({ serverId: SERVER_ID });
    await rollback({ serverId: SERVER_ID });

    expect((await live())?.status).toBe("ended");
  });

  test("a compensation with nothing to close does not throw", async () => {
    await rollback({ serverId: SERVER_ID });

    expect(await live()).toBeUndefined();
  });
});
