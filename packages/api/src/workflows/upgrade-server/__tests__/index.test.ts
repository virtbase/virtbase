/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * The workflow, with every step it calls replaced, as in
 * `extend-server/__tests__/index.test.ts`: the orchestration is under test,
 * not what any individual step does.
 */
let upgradeServerWorkflow: typeof import("../index.ts").upgradeServerWorkflow;

const calls: string[] = [];

/** Step names that should throw the next time the workflow calls them. */
let failing: Set<string>;

/** The server the mocked `getServerStep` returns; tests set its abuse lock. */
const storedServer: {
  vmid: number;
  serverPlanId: string;
  serverPlanPriceId: string;
  proxmoxNode: {
    hostname: string;
    fqdn: string;
    tokenID: string;
    tokenSecret: string;
  };
  abuseLockedAt: Date | null;
  abuseLockLevel: "throttle" | "isolate" | "power_off" | null;
} = {
  vmid: 100,
  serverPlanId: "pck_0000000000000000000000000",
  serverPlanPriceId: "price_0000000000000000000000000",
  proxmoxNode: { hostname: "node", fqdn: "node", tokenID: "", tokenSecret: "" },
  abuseLockedAt: null,
  abuseLockLevel: null,
};

const step =
  <T>(name: string, result: T) =>
  async () => {
    calls.push(name);
    if (failing.has(name)) {
      throw new Error(`${name} is unavailable`);
    }
    return result;
  };

beforeAll(async () => {
  mock.module("../../shared/get-server.ts", () => ({
    getServerStep: step("getServerStep", storedServer),
  }));
  mock.module("../../shared/get-server-plan.ts", () => ({
    getServerPlanStep: step("getServerPlanStep", {
      cores: 2,
      memory: 2048,
      storage: 40,
      netrate: 1000,
    }),
  }));
  mock.module("../../shared/get-guest-config.ts", () => ({
    getGuestConfigStep: step("getGuestConfigStep", { config: {} }),
  }));
  mock.module("../../shared/apply-guest-config.ts", () => ({
    applyGuestConfigStep: step("applyGuestConfigStep", {
      upid: null,
      previousConfig: {},
      addedKeys: [],
    }),
    rollbackApplyGuestConfigStep: step("rollbackApplyGuestConfigStep", {
      upid: null,
    }),
  }));
  mock.module("../../shared/resize-disk.ts", () => ({
    resizeDiskStep: step("resizeDiskStep", { resizeUpid: null }),
  }));
  mock.module("../store-server-upgrade.ts", () => ({
    storeServerUpgradeStep: step("storeServerUpgradeStep", undefined),
    rollbackStoreServerUpgradeStep: step(
      "rollbackStoreServerUpgradeStep",
      undefined,
    ),
  }));
  mock.module("../../shared/perform-guest-action.ts", () => ({
    // A null upid keeps the workflow out of `sleep()` and the task wait.
    performGuestActionStep: step("performGuestActionStep", { upid: null }),
    rollbackPerformGuestActionStep: step("rollbackPerformGuestActionStep", {
      upid: null,
    }),
  }));
  mock.module("../../shared/wait-for-proxmox-task.ts", () => ({
    waitForProxmoxTaskStep: step("waitForProxmoxTaskStep", undefined),
  }));
  mock.module("../../shared/report-rollback-failure.ts", () => ({
    reportRollbackFailureStep: step("reportRollbackFailureStep", undefined),
  }));

  ({ upgradeServerWorkflow } = await import("../index.ts"));
});

beforeEach(() => {
  calls.length = 0;
  failing = new Set();
  storedServer.abuseLockedAt = null;
  storedServer.abuseLockLevel = null;
});

const upgrade = () =>
  upgradeServerWorkflow({
    serverId: "kvm_0000000000000000000000000",
    serverPlanId: "pck_0000000000000000000000001",
    serverPlanPriceId: "price_0000000000000000000000001",
  });

describe("upgradeServerWorkflow", () => {
  test("it stops and starts the guest to apply the new hardware", async () => {
    await upgrade();

    expect(
      calls.filter((name) => name === "performGuestActionStep"),
    ).toHaveLength(2);
  });

  test("it leaves a guest held off by an abuse lock powered off", async () => {
    // Risk C13: an abuse lock that holds the guest off is not lifted by an
    // upgrade.
    storedServer.abuseLockedAt = new Date("2026-10-01T00:00:00.000Z");
    storedServer.abuseLockLevel = "power_off";

    await upgrade();

    expect(calls).not.toContain("performGuestActionStep");
    expect(calls).toContain("storeServerUpgradeStep");
  });
});
