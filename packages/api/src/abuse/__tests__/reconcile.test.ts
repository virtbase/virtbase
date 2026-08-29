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
import { reconcileAbuseCases } from "../reconcile";

let testDb: TestDb;

const CASE_ID = "abus_0000000000000000000000001";
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const hoursAhead = (hours: number) => new Date(Date.now() + hours * 3_600_000);

/** Enough of a guest for the locks to run against; state is not asserted here. */
const guest = {
  config: { onboot: true, net0: "virtio=AA:BB,bridge=vmbr0" },
  firewall: { enable: false, policy_out: "ACCEPT" } as Record<string, unknown>,
  running: true,
};

const resolveVm = (() => ({
  config: {
    $get: async () => guest.config,
    $put: async (values: Record<string, unknown>) =>
      Object.assign(guest.config, values),
  },
  status: {
    current: {
      $get: async () => ({ status: guest.running ? "running" : "stopped" }),
    },
    stop: {
      $post: async () => {
        guest.running = false;
      },
    },
    start: {
      $post: async () => {
        guest.running = true;
      },
    },
  },
  firewall: {
    options: {
      $get: async () => guest.firewall,
      $put: async (values: Record<string, unknown>) =>
        Object.assign(guest.firewall, values),
    },
  },
})) as unknown as VmResolver;

const seedCase = async (values: Record<string, unknown>) => {
  await testDb.insert(abuseCases).values({
    id: CASE_ID,
    userId: mockSession.user.id,
    category: "spam",
    severity: "high",
    title: "Outbound spam",
    ...values,
  } as never);

  await testDb
    .insert(abuseCaseServers)
    .values({ caseId: CASE_ID, serverId: mockServer.id });
};

const readCase = () =>
  testDb
    .select()
    .from(abuseCases)
    .where(eq(abuseCases.id, CASE_ID))
    .then(([row]) => row);

beforeEach(async () => {
  testDb = await createTestDb();
  guest.firewall = { enable: false, policy_out: "ACCEPT" };
  guest.running = true;
  guest.config = { onboot: true, net0: "virtio=AA:BB,bridge=vmbr0" };

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

describe("reconcileAbuseCases", () => {
  test("applies enforcement once the grace window has passed", async () => {
    await seedCase({
      status: "awaiting_customer",
      enforcement: "isolate",
      enforceAt: hoursAgo(1),
      respondBy: hoursAhead(12),
    });

    const result = await reconcileAbuseCases({
      db: testDb as never,
      resolveVm,
    });

    expect(result.enforced).toBe(1);
    expect((await readCase())?.enforcedAt).not.toBeNull();
    expect(guest.firewall.policy_out).toBe("DROP");
  });

  test("leaves a case alone while its grace window is still running", async () => {
    // The window is the customer's chance to act first. A case settled inside
    // it is never enforced at all, which is the whole point of having one.
    await seedCase({
      status: "awaiting_customer",
      enforcement: "isolate",
      enforceAt: hoursAhead(1),
      respondBy: hoursAhead(12),
    });

    const result = await reconcileAbuseCases({
      db: testDb as never,
      resolveVm,
    });

    expect(result.enforced).toBe(0);
    expect((await readCase())?.enforcedAt).toBeNull();
    expect(guest.firewall.policy_out).toBe("ACCEPT");
  });

  test("escalates one level when the customer does not answer", async () => {
    await seedCase({
      status: "awaiting_customer",
      enforcement: "throttle",
      enforceAt: hoursAgo(24),
      enforcedAt: hoursAgo(23),
      respondBy: hoursAgo(1),
    });

    const result = await reconcileAbuseCases({
      db: testDb as never,
      resolveVm,
    });

    expect(result.escalated).toBe(1);

    const abuseCase = await readCase();
    expect(abuseCase?.enforcement).toBe("isolate");
    expect(abuseCase?.escalatedAt).not.toBeNull();
    expect(guest.firewall.policy_out).toBe("DROP");
  });

  test("escalation stops short of termination", async () => {
    // Destroying a customer's data after a grace period is a decision an
    // operator signs, not something a clock running out can reach.
    await seedCase({
      status: "awaiting_customer",
      enforcement: "power_off",
      enforceAt: hoursAgo(24),
      enforcedAt: hoursAgo(23),
      respondBy: hoursAgo(1),
    });

    await reconcileAbuseCases({ db: testDb as never, resolveVm });

    expect((await readCase())?.enforcement).toBe("power_off");
  });

  test("escalates once, not on every run", async () => {
    await seedCase({
      status: "awaiting_customer",
      enforcement: "throttle",
      enforcedAt: hoursAgo(23),
      respondBy: hoursAgo(1),
    });

    await reconcileAbuseCases({ db: testDb as never, resolveVm });
    const second = await reconcileAbuseCases({
      db: testDb as never,
      resolveVm,
    });

    expect(second.escalated).toBe(0);
    expect((await readCase())?.enforcement).toBe("isolate");
  });

  test("closes a mitigated case once the observation window elapses", async () => {
    await seedCase({
      status: "mitigated",
      enforcement: "isolate",
      enforcedAt: hoursAgo(30),
      observeUntil: hoursAgo(1),
    });
    await testDb
      .update(abuseCaseServers)
      .set({ lockLevel: "isolate", lockedAt: hoursAgo(30) })
      .where(eq(abuseCaseServers.caseId, CASE_ID));

    const result = await reconcileAbuseCases({
      db: testDb as never,
      resolveVm,
    });

    expect(result.closed).toBe(1);

    const abuseCase = await readCase();
    expect(abuseCase?.status).toBe("resolved");
    expect(abuseCase?.resolution).toBe("fixed_by_customer");
    // Closing is what releases; a resolved case must not leave a locked server.
    expect(abuseCase?.releasedAt).not.toBeNull();

    const [link] = await testDb
      .select()
      .from(abuseCaseServers)
      .where(eq(abuseCaseServers.caseId, CASE_ID));
    expect(link?.lockLevel).toBe("none");
    expect(link?.releasedAt).not.toBeNull();
  });

  test("a mitigated case still being watched is left open", async () => {
    await seedCase({
      status: "mitigated",
      enforcement: "isolate",
      observeUntil: hoursAhead(12),
    });

    const result = await reconcileAbuseCases({
      db: testDb as never,
      resolveVm,
    });

    expect(result.closed).toBe(0);
    expect((await readCase())?.status).toBe("mitigated");
  });
});
