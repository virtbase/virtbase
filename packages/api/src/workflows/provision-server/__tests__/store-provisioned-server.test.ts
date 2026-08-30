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
import { and, eq, isNull } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockProxmoxNode,
  mockServerPlan,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../../testing/fixtures";

let db: TestDb;
let store: typeof import("../store-provisioned-server").storeProvisionedServerStep;
let rollback: typeof import("../store-provisioned-server").rollbackStoreProvisionedServerStep;

const USER_ID = mockSession.user.id;
const SUBNET_ID = "ipsub_0000000000000000000000009";
const VMID = 4242;

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));
  ({
    storeProvisionedServerStep: store,
    rollbackStoreProvisionedServerStep: rollback,
  } = await import("../store-provisioned-server"));

  await seedServerGraph(db);
  await db.insert(schema.users).values({
    id: "usr_0000000000000000000000009",
    email: "other@example.com",
    emailVerified: true,
    name: "Somebody Else",
    role: "CUSTOMER",
  });
});

afterEachCleanup();

function afterEachCleanup() {
  beforeEach(async () => {
    await db.delete(schema.subnetAllocations);
    await db.delete(schema.servers).where(eq(schema.servers.vmid, VMID));
    await db.delete(schema.subnets);
    await db.insert(schema.subnets).values({
      id: SUBNET_ID,
      cidr: "198.51.100.0/24",
      gateway: "198.51.100.1",
    });
  });
}

afterAll(async () => {
  await db.$client.close();
});

const provision = (userId = USER_ID) =>
  store({
    vmid: VMID,
    name: "vm-4242",
    userId,
    serverPlanId: mockServerPlan.id,
    serverPlanPriceId: mockServerPlanPrice.id,
    proxmoxNodeId: mockProxmoxNode.id,
    proxmoxTemplateId: null,
    allocations: [SUBNET_ID],
  });

/** What `getAvailableSubnet` considers taken: an allocation not yet released. */
const liveAllocations = () =>
  db.$count(
    schema.subnetAllocations,
    isNull(schema.subnetAllocations.deallocatedAt),
  );

describe("storeProvisionedServerStep", () => {
  test("a retry of a run that already committed adopts its row", async () => {
    // [!] The workflow runtime re-runs a step that committed and then lost its
    // acknowledgement. `servers` carries a unique `(proxmox_node_id, vmid)`, so
    // the retry used to die on a constraint violation - after the first run had
    // written the row and its allocations, and before the rollback that would
    // undo them had been pushed. The guest is provisioned either way; adopting
    // the row is what lets the workflow carry on and finish.
    const first = await provision();
    const second = await provision();

    expect(second.serverId).toBe(first.serverId);
    expect(await db.$count(schema.servers, eq(schema.servers.vmid, VMID))).toBe(
      1,
    );
    // And no second allocation for the same subnet.
    expect(await liveAllocations()).toBe(1);
  });

  test("it refuses to hand one customer another customer's guest", async () => {
    await provision();

    expect(provision("usr_0000000000000000000000009")).rejects.toThrow(
      /already belongs to another account/,
    );
  });
});

describe("rollbackStoreProvisionedServerStep", () => {
  test("it returns the addresses to the pool", async () => {
    // [!] The regression. The rollback detached the allocation from the server
    // and refreshed `allocated_at`, but never set `deallocated_at` - and
    // `getAvailableSubnet` treats every allocation with a null `deallocated_at`
    // as taken. A provision that failed after this point leaked its address for
    // good; a partial unique index on `(subnet_id) WHERE deallocated_at IS
    // NULL` would then make the next customer's provision fail outright.
    const { serverId } = await provision();
    expect(await liveAllocations()).toBe(1);

    await rollback({ serverId });

    expect(await liveAllocations()).toBe(0);
    expect(
      await db.$count(schema.servers, eq(schema.servers.id, serverId)),
    ).toBe(0);
  });

  test("it keeps the record of which address was handed out", async () => {
    // Deliberately not deleted. `subnet_allocations` is `anonymise` rather than
    // `erase` in the retention map: which address was assigned when has an
    // abuse-handling basis of its own. Detaching before the delete is what
    // keeps the row - the foreign key cascades from `servers`, so the opposite
    // order destroys it.
    const { serverId } = await provision();

    await rollback({ serverId });

    const [row] = await db
      .select({
        serverId: schema.subnetAllocations.serverId,
        deallocatedAt: schema.subnetAllocations.deallocatedAt,
      })
      .from(schema.subnetAllocations)
      .where(eq(schema.subnetAllocations.subnetId, SUBNET_ID));

    expect(row?.serverId).toBeNull();
    expect(row?.deallocatedAt).not.toBeNull();
  });

  test("the subnet can be allocated again afterwards", async () => {
    const { serverId } = await provision();
    await rollback({ serverId });

    // The whole point of releasing it: the next provision can have it.
    const { serverId: retried } = await provision();

    expect(retried).not.toBe(serverId);
    expect(
      await db.$count(
        schema.subnetAllocations,
        and(
          eq(schema.subnetAllocations.subnetId, SUBNET_ID),
          isNull(schema.subnetAllocations.deallocatedAt),
        ),
      ),
    ).toBe(1);
  });
});
