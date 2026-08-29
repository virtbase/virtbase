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

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  abuseCaseEvents,
  abuseCaseServers,
  abuseCases,
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

mock.module("../../notifications/dispatch", () => ({
  dispatchNotification: async () => ({
    created: 0,
    deduplicated: 0,
    delivered: 0,
    skipped: 0,
    failed: 0,
  }),
}));

import {
  mockDatacenter,
  mockProxmoxNode,
  mockProxmoxNodeGroup,
  mockServer,
  mockServerPlan,
  mockServerPlanPrice,
  mockSession,
} from "../../testing";
import type { VmResolver } from "../enforce";
import { enforceCase, reconcileAbuseLocks, releaseCase } from "../enforce";

let testDb: TestDb;

const CASE_ID = "abus_0000000000000000000000001";

/**
 * A Proxmox guest reduced to the calls the locks make, with its state kept in
 * memory so a test can assert what was actually written to the hypervisor
 * rather than only what the database now claims.
 */
interface FakeGuest {
  config: Record<string, unknown>;
  firewall: { enable?: boolean; policy_out?: string };
  running: boolean;
  unreachable?: boolean;
}

const createGuest = (overrides: Partial<FakeGuest> = {}): FakeGuest => ({
  config: { onboot: true, net0: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0" },
  firewall: { enable: false, policy_out: "ACCEPT" },
  running: true,
  ...overrides,
});

const resolverFor = (guest: FakeGuest): VmResolver => {
  const refuse = () => {
    if (guest.unreachable) throw new Error("node unreachable");
  };

  return (() => ({
    config: {
      $get: async () => {
        refuse();
        return guest.config;
      },
      $put: async (values: Record<string, unknown>) => {
        refuse();
        Object.assign(guest.config, values);
      },
    },
    status: {
      current: {
        $get: async () => {
          refuse();
          return { status: guest.running ? "running" : "stopped" };
        },
      },
      stop: {
        $post: async () => {
          refuse();
          guest.running = false;
        },
      },
      start: {
        $post: async () => {
          refuse();
          guest.running = true;
        },
      },
    },
    firewall: {
      options: {
        $get: async () => {
          refuse();
          return guest.firewall;
        },
        $put: async (values: Record<string, unknown>) => {
          refuse();
          Object.assign(guest.firewall, values);
        },
      },
    },
  })) as unknown as VmResolver;
};

const seedCase = async (values: Record<string, unknown> = {}) => {
  await testDb.insert(abuseCases).values({
    id: CASE_ID,
    userId: mockSession.user.id,
    category: "spam",
    severity: "high",
    status: "awaiting_customer",
    title: "Outbound spam",
    enforcement: "isolate",
    ...values,
  });

  await testDb
    .insert(abuseCaseServers)
    .values({ caseId: CASE_ID, serverId: mockServer.id });
};

const readLink = () =>
  testDb
    .select()
    .from(abuseCaseServers)
    .where(eq(abuseCaseServers.caseId, CASE_ID))
    .then(([row]) => row);

const readServer = () =>
  testDb
    .select()
    .from(servers)
    .where(eq(servers.id, mockServer.id))
    .then(([row]) => row);

beforeEach(async () => {
  testDb = await createTestDb();

  await testDb.insert(users).values(mockSession.user);
  await testDb.insert(datacenters).values(mockDatacenter);
  await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
  await testDb.insert(serverPlans).values(mockServerPlan);
  await testDb.insert(serverPlanPrices).values(mockServerPlanPrice);
  await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
  await testDb.insert(servers).values(mockServer);
});

afterEach(async () => {
  await testDb.$client.close();
});

describe("enforceCase", () => {
  test("isolate drops outbound and records what it replaced", async () => {
    const guest = createGuest();
    await seedCase();

    const result = await enforceCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    expect(result).toMatchObject({ locked: 1, failed: 0, level: "isolate" });
    expect(guest.firewall).toEqual({ enable: true, policy_out: "DROP" });

    const link = await readLink();
    expect(link?.lockLevel).toBe("isolate");
    expect(link?.lockedAt).not.toBeNull();
    // The state to put back, not the state we just wrote.
    expect(link?.previousState).toEqual({
      firewall: { enable: false, policyOut: "ACCEPT" },
    });

    const server = await readServer();
    expect(server?.abuseLockedAt).not.toBeNull();
    expect(server?.abuseLockLevel).toBe("isolate");
  });

  test("throttle caps the guest NIC without losing its configuration", async () => {
    const guest = createGuest();
    await seedCase({ enforcement: "throttle" });

    await enforceCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    expect(guest.config.net0).toBe(
      "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0,rate=1",
    );
  });

  test("power_off stops the guest and keeps it down across a node reboot", async () => {
    const guest = createGuest();
    await seedCase({ enforcement: "power_off" });

    await enforceCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    expect(guest.running).toBe(false);
    // Without this a node rebooting would bring the abuse straight back.
    expect(guest.config.onboot).toBe(false);
  });

  test("a stale attribution is never enforced", async () => {
    const guest = createGuest();
    await seedCase({ staleAttribution: true });

    const result = await enforceCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    // The server on that address today belongs to somebody who did nothing.
    expect(result).toMatchObject({ locked: 0, level: "none" });
    expect(guest.firewall.policy_out).toBe("ACCEPT");
    expect((await readServer())?.abuseLockedAt).toBeNull();
  });

  test("an unreachable node leaves the row unlocked for the next sweep", async () => {
    const guest = createGuest({ unreachable: true });
    await seedCase();

    const result = await enforceCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    expect(result).toMatchObject({ locked: 0, failed: 1 });

    // The case must not claim an enforcement that never happened.
    const [abuseCase] = await testDb.select().from(abuseCases);
    expect(abuseCase?.enforcedAt).toBeNull();
    expect((await readLink())?.lockLevel).toBe("none");

    const events = await testDb
      .select()
      .from(abuseCaseEvents)
      .where(eq(abuseCaseEvents.caseId, CASE_ID));
    expect(events.map((event) => event.type)).toContain("enforcement.failed");
  });

  test("blocks new orders when the case says so, and only then", async () => {
    const guest = createGuest();
    await seedCase({ blocksOrdering: true });

    await enforceCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    const [user] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, mockSession.user.id));

    expect(user?.orderingBlockedAt).not.toBeNull();
    expect(user?.orderingBlockReason).toContain("AB-");
  });

  test("terminate hands over to the deletion lifecycle instead of locking", async () => {
    const guest = createGuest();
    await seedCase({ enforcement: "terminate" });

    await enforceCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    const server = await readServer();
    expect(server?.terminatesAt).not.toBeNull();
    // No hypervisor lock: the existing suspend-then-delete path takes it now.
    expect(guest.firewall.policy_out).toBe("ACCEPT");
  });
});

describe("releaseCase", () => {
  test("puts the guest back the way it was, not the way it is easiest", async () => {
    // Firewall on with a policy of its own before the case ever opened.
    const guest = createGuest({
      firewall: { enable: true, policy_out: "REJECT" },
    });
    await seedCase();

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });
    await releaseCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    expect(guest.firewall).toEqual({ enable: true, policy_out: "REJECT" });

    const link = await readLink();
    expect(link?.lockLevel).toBe("none");
    expect(link?.releasedAt).not.toBeNull();
    expect(link?.previousState).toBeNull();
    expect((await readServer())?.abuseLockedAt).toBeNull();
  });

  test("a guest that was stopped before the lock is not started by the release", async () => {
    const guest = createGuest({ running: false });
    await seedCase({ enforcement: "power_off" });

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });
    await releaseCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    expect(guest.running).toBe(false);
  });

  test("a guest that was running is started again", async () => {
    const guest = createGuest({ running: true });
    await seedCase({ enforcement: "power_off" });

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });
    expect(guest.running).toBe(false);

    await releaseCase({ db: testDb as never, caseId: CASE_ID, resolveVm });
    expect(guest.running).toBe(true);
  });

  test("the ordering block survives while another case still needs it", async () => {
    const guest = createGuest();
    await seedCase({ blocksOrdering: true });

    await testDb.insert(abuseCases).values({
      id: "abus_0000000000000000000000002",
      userId: mockSession.user.id,
      category: "ddos",
      severity: "critical",
      status: "open",
      title: "Second case",
      blocksOrdering: true,
    });

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });
    await releaseCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    const [user] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, mockSession.user.id));

    // Settling one of two open cases must not hand the customer the checkout.
    expect(user?.orderingBlockedAt).not.toBeNull();
  });
});

describe("reconcileAbuseLocks", () => {
  test("puts back a lock the customer removed, and counts it", async () => {
    const guest = createGuest();
    await seedCase();

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    // The customer's own firewall API can do exactly this.
    guest.firewall = { enable: false, policy_out: "ACCEPT" };

    const result = await reconcileAbuseLocks({
      db: testDb as never,
      resolveVm,
    });

    expect(result).toMatchObject({ checked: 1, drifted: 1, failed: 0 });
    expect(guest.firewall).toEqual({ enable: true, policy_out: "DROP" });

    const link = await readLink();
    expect(link?.driftCount).toBe(1);
    // The original state survives the re-assert; otherwise the release would
    // restore the lock instead of what came before it.
    expect(link?.previousState).toEqual({
      firewall: { enable: false, policyOut: "ACCEPT" },
    });

    const events = await testDb
      .select()
      .from(abuseCaseEvents)
      .where(eq(abuseCaseEvents.caseId, CASE_ID));
    expect(events.map((event) => event.type)).toContain("lock.drift");
  });

  test("a lock still in force is left alone", async () => {
    const guest = createGuest();
    await seedCase();

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    const result = await reconcileAbuseLocks({
      db: testDb as never,
      resolveVm,
    });

    expect(result).toMatchObject({ checked: 1, drifted: 0 });
    expect((await readLink())?.driftCount).toBe(0);
    expect((await readLink())?.lastAssertedAt).not.toBeNull();
  });

  test("a released lock is not reconciled back into place", async () => {
    const guest = createGuest();
    await seedCase();

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });
    await releaseCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    const result = await reconcileAbuseLocks({
      db: testDb as never,
      resolveVm,
    });

    expect(result.checked).toBe(0);
    expect(guest.firewall.policy_out).toBe("ACCEPT");
  });
});
