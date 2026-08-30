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
import * as realReportRollbackFailure from "../../shared/report-rollback-failure";

// `beforeAll` below replaces this shared module for the whole process -
// `mock.module` is never undone by `mock.restore()`. `run-rollbacks.test.ts`
// asserts on what the real reporter writes, so it has to be put back.
const realRollbackReporter = { ...realReportRollbackFailure };

afterAll(() => {
  mock.module(
    "../../shared/report-rollback-failure",
    () => realRollbackReporter,
  );
});

/**
 * The workflow, with every step it calls replaced.
 *
 * `"use workflow"` and `"use step"` are compile-time directives; at runtime
 * these are ordinary async functions, so which compensations get pushed - and
 * which failures are allowed to reach them - can be driven directly. That
 * orchestration is what is under test, not what any individual step does.
 */
let provisionServerWorkflow: typeof import("../index").provisionServerWorkflow;

const calls: string[] = [];

/** Step names that should throw the next time the workflow calls them. */
let failing: Set<string>;

const step =
  <T>(name: string, result: T) =>
  async () => {
    calls.push(name);
    if (failing.has(name)) {
      throw new Error(`${name} is unavailable`);
    }
    return result;
  };

const NODE = {
  id: "pxm_1",
  hostname: "node",
  fqdn: "node",
  tokenID: "",
  tokenSecret: "",
  vmStorage: "local-lvm",
  importStorage: "local",
  snippetStorage: "local",
};

beforeAll(async () => {
  // `sleep` would really wait, and `FatalError` has to stay constructible.
  mock.module("workflow", () => ({
    sleep: async () => {},
    FatalError: class FatalError extends Error {},
  }));

  mock.module("../select-proxmox-node", () => ({
    selectProxmoxNodeStep: step("selectProxmoxNodeStep", {
      plan: { netrate: 1000, storage: 100, proxmoxNodeGroupId: "png_1" },
      selectedNode: NODE,
    }),
  }));
  mock.module("../../shared/get-template", () => ({
    getTemplateStep: step("getTemplateStep", { volid: "local:iso/deb.img" }),
  }));
  mock.module("../../shared/get-network-adapters", () => ({
    getNetworkAdaptersStep: step("getNetworkAdaptersStep", {
      adapters: [],
      allocations: ["ipsub_1"],
    }),
  }));
  mock.module("../../shared/create-guest-from-image", () => ({
    createGuestFromImageStep: step("createGuestFromImageStep", {
      createdVmid: 100,
      createdName: "vm-100",
      createUpid: "UPID:create",
    }),
    rollbackCreateGuestFromImageStep: step(
      "rollbackCreateGuestFromImageStep",
      undefined,
    ),
  }));
  mock.module("../../shared/resize-disk", () => ({
    resizeDiskStep: step("resizeDiskStep", { resizeUpid: null }),
    rollbackResizeDiskStep: step("rollbackResizeDiskStep", undefined),
  }));
  mock.module("../apply-hardware-config", () => ({
    applyHardwareConfigStep: step("applyHardwareConfigStep", {
      configUpid: "UPID:config",
      rootPassword: "hunter2",
      isRootPasswordGenerated: true,
      sshKeyApplied: false,
    }),
    rollbackApplyHardwareConfigStep: step(
      "rollbackApplyHardwareConfigStep",
      undefined,
    ),
  }));
  mock.module("../../shared/apply-cloud-init", () => ({
    applyCloudInitStep: step("applyCloudInitStep", {
      cicustomUpid: "UPID:ci",
    }),
    rollbackApplyCloudInitStep: step("rollbackApplyCloudInitStep", undefined),
  }));
  mock.module("../apply-network-config", () => ({
    applyNetworkConfigStep: step("applyNetworkConfigStep", {
      networkConfigUpid: "UPID:net",
    }),
    rollbackApplyNetworkConfigStep: step(
      "rollbackApplyNetworkConfigStep",
      undefined,
    ),
  }));
  mock.module("../store-provisioned-server", () => ({
    storeProvisionedServerStep: step("storeProvisionedServerStep", {
      serverId: "kvm_1",
    }),
    rollbackStoreProvisionedServerStep: step(
      "rollbackStoreProvisionedServerStep",
      undefined,
    ),
  }));
  mock.module("../../shared/perform-guest-action", () => ({
    // A null upid keeps the workflow out of the task wait.
    performGuestActionStep: step("performGuestActionStep", { upid: null }),
    rollbackPerformGuestActionStep: step("rollbackPerformGuestActionStep", {
      upid: null,
    }),
  }));
  mock.module("../../shared/wait-for-proxmox-task", () => ({
    waitForProxmoxTaskStep: step("waitForProxmoxTaskStep", undefined),
  }));
  mock.module("../send-server-ready-email", () => ({
    sendServerReadyEmailStep: step("sendServerReadyEmailStep", undefined),
  }));
  mock.module("../../shared/get-ha-failover-nodes", () => ({
    getHAFailoverNodesStep: step("getHAFailoverNodesStep", { hostnames: [] }),
  }));
  mock.module("../../shared/update-ha-settings", () => ({
    updateHASettingsStep: step("updateHASettingsStep", undefined),
  }));
  mock.module("../../shared/report-swallowed-failure", () => ({
    reportSwallowedFailureStep: step("reportSwallowedFailureStep", undefined),
  }));
  mock.module("../../shared/report-rollback-failure", () => ({
    reportRollbackFailureStep: step("reportRollbackFailureStep", undefined),
  }));

  ({ provisionServerWorkflow } = await import("../index"));
});

const provision = () =>
  provisionServerWorkflow({
    serverPlanId: "srv_1",
    serverPlanPriceId: "price_1",
    userId: "usr_1",
    proxmoxTemplateId: "tpl_1",
  });

beforeEach(() => {
  calls.length = 0;
  failing = new Set();
});

describe("provisionServerWorkflow", () => {
  test("it provisions the server and tells the customer", async () => {
    await provision();

    expect(calls).toContain("storeProvisionedServerStep");
    expect(calls).toContain("sendServerReadyEmailStep");
    expect(calls).not.toContain("rollbackStoreProvisionedServerStep");
  });

  test("a mail outage does not tear down the server the customer paid for", async () => {
    // [!] The regression. `sendEmail` throws on a delivery failure, and this
    // call sits inside the block whose `catch` unwinds the compensation stack -
    // so once the runtime had exhausted the step's retries, a mail outage ran
    // the whole chain: the server row deleted, its addresses released and the
    // guest destroyed, for a server that was built, running and paid for.
    failing.add("sendServerReadyEmailStep");

    await provision();

    expect(calls).toContain("sendServerReadyEmailStep");
    expect(calls).toContain("reportSwallowedFailureStep");
    expect(calls).not.toContain("rollbackStoreProvisionedServerStep");
    expect(calls).not.toContain("rollbackCreateGuestFromImageStep");
  });

  test("a failure that really is compensable still unwinds the stack", async () => {
    // The control. Swallowing the email must not have made the workflow
    // swallow anything else: a step that fails before the server is finished
    // still destroys the guest and still surfaces its own error.
    failing.add("performGuestActionStep");

    await expect(provision()).rejects.toThrow(
      /performGuestActionStep is unavailable/,
    );

    expect(calls).toContain("rollbackStoreProvisionedServerStep");
    expect(calls).toContain("rollbackCreateGuestFromImageStep");
  });

  test("one failing compensation does not orphan the guest", async () => {
    // WF-4, end to end. The newest compensation throws, and the destroy at the
    // bottom of the stack - the one that stops a VM being left running on a
    // node with nobody paying for it - still runs.
    failing.add("performGuestActionStep");
    failing.add("rollbackStoreProvisionedServerStep");

    await provision().catch(() => {});

    expect(calls).toContain("rollbackStoreProvisionedServerStep");
    expect(calls).toContain("reportRollbackFailureStep");
    expect(calls).toContain("rollbackCreateGuestFromImageStep");
  });
});
