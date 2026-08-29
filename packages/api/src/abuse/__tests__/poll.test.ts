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
  abuseCases,
  abuseSignals,
  abuseSourceCursors,
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  subnetAllocations,
  subnets,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import type { AbusePollRequest, AbuseSource } from "@virtbase/ports";

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
import { isPublicIpv4, supernet } from "../cidr";
import { collectPollTargets, pollAbuseSources } from "../poll";

let testDb: TestDb;

/** A source that records what it was offered and answers with what it is told. */
const createSource = (
  behaviour: {
    cover?: (targets: string[]) => string[];
    signalsFor?: string[];
    quotaRemaining?: number;
    throws?: boolean;
  } = {},
) => {
  const seen: AbusePollRequest[] = [];

  const source: AbuseSource = {
    id: "fake",
    async poll(request) {
      seen.push(request);
      if (behaviour.throws) throw new Error("provider down");

      const offered = request.targets.map((target) => target.cidr);
      const covered = behaviour.cover ? behaviour.cover(offered) : offered;

      return {
        signals: (behaviour.signalsFor ?? []).map((ip, index) => ({
          source: "fake",
          externalId: `${ip}:${index}`,
          type: "abuse.spam",
          state: "firing" as const,
          severity: "warning" as const,
          subject: { kind: "ip" as const, value: ip },
          title: `Reported ${ip}`,
          occurredAt: new Date(),
        })),
        covered,
        ...(undefined === behaviour.quotaRemaining
          ? {}
          : { quotaRemaining: behaviour.quotaRemaining }),
      };
    },
  };

  return { source, seen };
};

const allocate = async (
  id: string,
  cidr: string,
  serverId: string | null = mockServer.id,
) => {
  await testDb
    .insert(subnets)
    .values({ id, cidr, gateway: cidr.split("/")[0] as string });
  await testDb
    .insert(subnetAllocations)
    .values({ subnetId: id, serverId, allocatedAt: new Date() });
};

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

describe("collectPollTargets", () => {
  test("rolls per-server subnets up to the block the provider accepts", async () => {
    // A fleet stores one subnet per server; sweeping those directly would cost
    // one provider call per customer.
    await allocate("ipsub_1", "45.83.100.10/32");
    await allocate("ipsub_2", "45.83.100.11/32");
    await allocate("ipsub_3", "45.83.101.10/32");

    const targets = await collectPollTargets({
      db: testDb as never,
      source: "fake",
    });

    expect(targets.map((target) => target.cidr).sort()).toEqual([
      "45.83.100.0/24",
      "45.83.101.0/24",
    ]);
    expect(targets.find((t) => "45.83.100.0/24" === t.cidr)?.servers).toBe(2);
  });

  test("skips ranges nobody could report", async () => {
    // Private and documentation ranges cannot host anything reportable, and a
    // sweep over them spends real quota on a guaranteed empty answer.
    await allocate("ipsub_priv", "10.0.0.5/32");
    await allocate("ipsub_doc", "203.0.113.5/32");
    await allocate("ipsub_pub", "45.83.100.10/32");

    const targets = await collectPollTargets({
      db: testDb as never,
      source: "fake",
    });

    expect(targets.map((target) => target.cidr)).toEqual(["45.83.100.0/24"]);
  });

  test("ignores released allocations", async () => {
    await allocate("ipsub_gone", "45.83.100.10/32");
    await testDb
      .update(subnetAllocations)
      .set({ deallocatedAt: new Date() })
      .where(eq(subnetAllocations.subnetId, "ipsub_gone"));

    expect(
      await collectPollTargets({ db: testDb as never, source: "fake" }),
    ).toEqual([]);
  });

  test("never-swept ranges go first, then the oldest", async () => {
    await allocate("ipsub_a", "45.83.100.10/32");
    await allocate("ipsub_b", "45.83.101.10/32");
    await allocate("ipsub_c", "45.83.102.10/32");

    const hoursAgo = (hours: number) =>
      new Date(Date.now() - hours * 3_600_000);

    await testDb.insert(abuseSourceCursors).values([
      {
        source: "fake",
        target: "45.83.100.0/24",
        watermark: hoursAgo(1),
        lastPolledAt: hoursAgo(1),
      },
      {
        source: "fake",
        target: "45.83.101.0/24",
        watermark: hoursAgo(48),
        lastPolledAt: hoursAgo(48),
      },
    ]);

    const targets = await collectPollTargets({
      db: testDb as never,
      source: "fake",
    });

    expect(targets.map((target) => target.cidr)).toEqual([
      // Never asked about.
      "45.83.102.0/24",
      // Longest ago.
      "45.83.101.0/24",
      "45.83.100.0/24",
    ]);
  });

  test("another source's cursors do not affect this one", async () => {
    await allocate("ipsub_a", "45.83.100.10/32");
    await testDb.insert(abuseSourceCursors).values({
      source: "somebody-else",
      target: "45.83.100.0/24",
      watermark: new Date(),
      lastPolledAt: new Date(),
    });

    const [target] = await collectPollTargets({
      db: testDb as never,
      source: "fake",
    });

    expect(target?.lastPolledAt).toBeNull();
  });
});

describe("pollAbuseSources", () => {
  test("ingests what a source returns and advances its cursors", async () => {
    await allocate("ipsub_a", "45.83.100.10/32");

    const { source, seen } = createSource({
      signalsFor: ["45.83.100.10"],
      quotaRemaining: 900,
    });

    const [result] = await pollAbuseSources({
      db: testDb as never,
      sources: [source],
    });

    expect(result).toMatchObject({
      source: "fake",
      offered: 1,
      covered: 1,
      signals: 1,
      quotaRemaining: 900,
      error: null,
    });

    // A range may cost more than one call, so the ceiling allows for it.
    expect(seen[0]?.budget).toBe(2);

    const [cursor] = await testDb.select().from(abuseSourceCursors);
    expect(cursor).toMatchObject({
      source: "fake",
      target: "45.83.100.0/24",
    });
    expect(cursor?.lastPolledAt).not.toBeNull();

    // The signal reached the pipeline and was attributed to the holder.
    const [signal] = await testDb.select().from(abuseSignals);
    expect(signal?.serverId).toBe(mockServer.id);
    expect(await testDb.select().from(abuseCases)).toHaveLength(1);
  });

  test("only covered ranges advance their watermark", async () => {
    await allocate("ipsub_a", "45.83.100.10/32");
    await allocate("ipsub_b", "45.83.101.10/32");

    // A source that ran out of quota after the first range.
    const { source } = createSource({
      cover: (targets) => targets.slice(0, 1),
    });

    const [result] = await pollAbuseSources({
      db: testDb as never,
      sources: [source],
    });

    expect(result).toMatchObject({ offered: 2, covered: 1 });

    const cursors = await testDb.select().from(abuseSourceCursors);
    // The range nobody looked at keeps no cursor, so it goes first next run
    // rather than silently skipping the window.
    expect(cursors).toHaveLength(1);
  });

  test("a failing source is reported without taking the run down", async () => {
    await allocate("ipsub_a", "45.83.100.10/32");

    const { source } = createSource({ throws: true });
    const healthy = createSource({ signalsFor: [] });

    const results = await pollAbuseSources({
      db: testDb as never,
      sources: [source, { ...healthy.source, id: "healthy" }],
    });

    expect(results[0]?.error).toContain("provider down");
    expect(results[1]?.error).toBeNull();
  });

  test("a fleet with no public ranges asks nothing", async () => {
    await allocate("ipsub_priv", "10.0.0.5/32");

    const { source, seen } = createSource();
    const [result] = await pollAbuseSources({
      db: testDb as never,
      sources: [source],
    });

    expect(result).toMatchObject({ offered: 0, covered: 0 });
    expect(seen).toHaveLength(0);
  });
});

describe("cidr helpers", () => {
  test("supernet rolls an address up to a block", () => {
    expect(supernet("45.83.100.137/32", 24)).toBe("45.83.100.0/24");
    expect(supernet("45.83.100.137/32", 16)).toBe("45.83.0.0/16");
  });

  test("a subnet already wider than the block is refused", () => {
    // Asking about a /16 when the key allows /24 is a call that fails, not one
    // that covers more.
    expect(supernet("45.83.0.0/16", 24)).toBeNull();
  });

  test("rejects nonsense rather than guessing", () => {
    expect(supernet("not-an-address", 24)).toBeNull();
    expect(supernet("45.83.300.1/32", 24)).toBeNull();
  });

  test("knows which ranges are ours to report on", () => {
    expect(isPublicIpv4("45.83.100.10/32")).toBe(true);
    expect(isPublicIpv4("10.0.0.1/32")).toBe(false);
    expect(isPublicIpv4("192.168.1.1/32")).toBe(false);
    expect(isPublicIpv4("172.16.5.4/32")).toBe(false);
    expect(isPublicIpv4("127.0.0.1/32")).toBe(false);
    expect(isPublicIpv4("100.64.0.1/32")).toBe(false);
    // The documentation ranges every test in this repo uses.
    expect(isPublicIpv4("203.0.113.5/32")).toBe(false);
    expect(isPublicIpv4("198.51.100.5/32")).toBe(false);
  });
});
