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
    // The state to put back, not the state we just wrote, keyed by the level
    // that replaced it so an escalation can record its own.
    expect(link?.previousState).toEqual({
      isolate: { firewall: { enable: false, policyOut: "ACCEPT" } },
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

  test("an escalation records what it replaces instead of trusting the last level", async () => {
    // The customer's own firewall policy, set long before the case existed.
    const guest = createGuest({
      firewall: { enable: true, policy_out: "REJECT" },
    });
    await seedCase({ enforcement: "throttle" });

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    // The response deadline elapses and the sweep tightens one level, which
    // enforces again with the state the first level captured already on the row.
    await testDb
      .update(abuseCases)
      .set({ enforcement: "isolate" })
      .where(eq(abuseCases.id, CASE_ID));
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    expect(guest.firewall).toEqual({ enable: true, policy_out: "DROP" });

    // Each level records what it replaced. Without the second entry the
    // customer's REJECT policy is simply gone.
    expect((await readLink())?.previousState).toEqual({
      throttle: {
        network: {
          device: "net0",
          value: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
        },
      },
      isolate: { firewall: { enable: true, policyOut: "REJECT" } },
    });
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

  test("undoes every level the case applied, in reverse", async () => {
    const guest = createGuest({
      firewall: { enable: true, policy_out: "REJECT" },
    });
    await seedCase({ enforcement: "throttle" });

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    await testDb
      .update(abuseCases)
      .set({ enforcement: "isolate" })
      .where(eq(abuseCases.id, CASE_ID));
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    await releaseCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    // The policy the customer chose, not the default a release is tempted to
    // guess at.
    expect(guest.firewall).toEqual({ enable: true, policy_out: "REJECT" });
    // And the rate limit the case's first level put on. Releasing only the
    // level the row happens to be at leaves the customer capped at 1 MB/s on a
    // case that is closed.
    expect(guest.config.net0).toBe("virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0");
  });

  test("a previous_state written before it was keyed by level still releases", async () => {
    const guest = createGuest({
      firewall: { enable: true, policy_out: "DROP" },
    });
    await seedCase();

    // A row locked by the code that stored one bare capture per server.
    await testDb
      .update(abuseCaseServers)
      .set({
        lockLevel: "isolate",
        lockedAt: new Date(),
        previousState: { firewall: { enable: true, policyOut: "REJECT" } },
      })
      .where(eq(abuseCaseServers.caseId, CASE_ID));

    await releaseCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    expect(guest.firewall).toEqual({ enable: true, policy_out: "REJECT" });
    expect((await readLink())?.lockLevel).toBe("none");
  });

  test("a legacy row whose escalation lost the firewall still loses the rate limit", async () => {
    // Exactly what the old escalation left behind: an `isolate` row carrying
    // the capture the `throttle` before it took. The firewall policy it
    // overwrote was never recorded and cannot be recovered, but the throttle
    // still has to come off.
    const guest = createGuest({
      config: {
        onboot: true,
        net0: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0,rate=1",
      },
      firewall: { enable: true, policy_out: "DROP" },
    });
    await seedCase();

    await testDb
      .update(abuseCaseServers)
      .set({
        lockLevel: "isolate",
        lockedAt: new Date(),
        previousState: {
          network: {
            device: "net0",
            value: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
          },
        },
      })
      .where(eq(abuseCaseServers.caseId, CASE_ID));

    await releaseCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm: resolverFor(guest),
    });

    expect(guest.config.net0).toBe("virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0");
    expect(guest.firewall.policy_out).toBe("ACCEPT");
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
      isolate: { firewall: { enable: false, policyOut: "ACCEPT" } },
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

  test("a settled case is never re-locked", async () => {
    const guest = createGuest();
    await seedCase();

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    // Resolved, but the release did not finish putting the guest back - the
    // node was unreachable for the few seconds it took.
    await testDb
      .update(abuseCases)
      .set({
        status: "resolved",
        resolution: "false_positive",
        closedAt: new Date(),
      })
      .where(eq(abuseCases.id, CASE_ID));
    guest.firewall = { enable: false, policy_out: "ACCEPT" };

    const result = await reconcileAbuseLocks({
      db: testDb as never,
      resolveVm,
    });

    // Not drift. Nobody removed this lock behind our back; the case is closed.
    expect(result.drifted).toBe(0);
    expect(guest.firewall.policy_out).toBe("ACCEPT");

    const link = await readLink();
    expect(link?.driftCount).toBe(0);
    expect(link?.lockLevel).toBe("none");
    expect(link?.releasedAt).not.toBeNull();

    const events = await testDb
      .select()
      .from(abuseCaseEvents)
      .where(eq(abuseCaseEvents.caseId, CASE_ID));
    expect(events.map((event) => event.type)).not.toContain("lock.drift");
  });

  test("a release that could not reach the node is retried until it settles", async () => {
    const guest = createGuest({
      firewall: { enable: true, policy_out: "REJECT" },
    });
    await seedCase();

    const resolveVm = resolverFor(guest);
    await enforceCase({ db: testDb as never, caseId: CASE_ID, resolveVm });

    await testDb
      .update(abuseCases)
      .set({
        status: "resolved",
        resolution: "false_positive",
        closedAt: new Date(),
      })
      .where(eq(abuseCases.id, CASE_ID));

    guest.unreachable = true;
    const release = await releaseCase({
      db: testDb as never,
      caseId: CASE_ID,
      resolveVm,
    });

    // Nothing came off, and the row still says the customer is locked.
    expect(release).toMatchObject({ released: 0, failed: 1 });
    expect((await readLink())?.lockLevel).toBe("isolate");
    expect(guest.firewall).toEqual({ enable: true, policy_out: "DROP" });

    // The node is still down on the next sweep, and the row waits rather than
    // being abandoned or re-locked.
    const first = await reconcileAbuseLocks({ db: testDb as never, resolveVm });
    expect(first).toMatchObject({ released: 0, drifted: 0, failed: 1 });
    expect((await readLink())?.releasedAt).toBeNull();

    guest.unreachable = false;
    const second = await reconcileAbuseLocks({
      db: testDb as never,
      resolveVm,
    });

    expect(second).toMatchObject({ released: 1, drifted: 0, failed: 0 });
    expect(guest.firewall).toEqual({ enable: true, policy_out: "REJECT" });

    const link = await readLink();
    expect(link?.lockLevel).toBe("none");
    expect(link?.releasedAt).not.toBeNull();
    expect(link?.driftCount).toBe(0);
    expect((await readServer())?.abuseLockedAt).toBeNull();
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
