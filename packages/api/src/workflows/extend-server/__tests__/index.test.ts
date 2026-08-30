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

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * The workflow, with every step it calls replaced.
 *
 * `"use workflow"` and `"use step"` are compile-time directives; at runtime
 * these are ordinary async functions, so the orchestration - which
 * compensations get pushed, and which failures are allowed to reach them - can
 * be driven directly. That is the part under test here, not what any individual
 * step does.
 */
let extendServerWorkflow: typeof import("../index").extendServerWorkflow;

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

beforeAll(async () => {
  mock.module("../store-server-extension", () => ({
    storeServerExtensionStep: step("storeServerExtensionStep", {
      server: { vmid: 100, name: "My server", suspendedAt: null },
      proxmoxNode: {
        hostname: "node",
        fqdn: "node",
        tokenID: "",
        tokenSecret: "",
      },
      user: { name: "Mock User", email: "test@example.com", locale: "en" },
      newTerminatesAt: new Date("2026-10-01T00:00:00.000Z"),
    }),
    rollbackStoreServerExtensionStep: step(
      "rollbackStoreServerExtensionStep",
      undefined,
    ),
  }));

  mock.module("../../shared/apply-guest-config", () => ({
    applyGuestConfigStep: step("applyGuestConfigStep", {
      upid: null,
      previousConfig: {},
      addedKeys: [],
    }),
    rollbackApplyGuestConfigStep: step("rollbackApplyGuestConfigStep", {
      upid: null,
    }),
  }));

  mock.module("../../shared/perform-guest-action", () => ({
    // A null upid keeps the workflow out of `sleep()` and the task wait.
    performGuestActionStep: step("performGuestActionStep", { upid: null }),
    rollbackPerformGuestActionStep: step("rollbackPerformGuestActionStep", {
      upid: null,
    }),
  }));

  mock.module("../../shared/wait-for-proxmox-task", () => ({
    waitForProxmoxTaskStep: step("waitForProxmoxTaskStep", undefined),
  }));

  mock.module("../send-server-extended-email", () => ({
    sendServerExtendedEmailStep: step("sendServerExtendedEmailStep", undefined),
  }));

  mock.module("../../shared/report-swallowed-failure", () => ({
    reportSwallowedFailureStep: step("reportSwallowedFailureStep", undefined),
  }));

  mock.module("../../shared/report-rollback-failure", () => ({
    reportRollbackFailureStep: step("reportRollbackFailureStep", undefined),
  }));

  ({ extendServerWorkflow } = await import("../index"));
});

beforeEach(() => {
  calls.length = 0;
  failing = new Set();
});

describe("extendServerWorkflow", () => {
  test("it extends the server and tells the customer", async () => {
    await extendServerWorkflow({ serverId: "kvm_1" });

    expect(calls).toContain("storeServerExtensionStep");
    expect(calls).toContain("sendServerExtendedEmailStep");
    expect(calls).not.toContain("rollbackStoreServerExtensionStep");
  });

  test("a mail outage does not revert the extension the customer paid for", async () => {
    // [!] The regression. `sendEmail` throws on a delivery failure, and this
    // call sits inside the block whose `catch` unwinds the compensation stack -
    // so a persistent outage used to run `rollbackStoreServerExtensionStep` and
    // take a month back off a term that had already been paid for and written.
    // The extension is done by this point; the notice is a post-success side
    // effect and has to be reported rather than compensated.
    failing.add("sendServerExtendedEmailStep");

    await extendServerWorkflow({ serverId: "kvm_1" });

    expect(calls).toContain("sendServerExtendedEmailStep");
    expect(calls).toContain("reportSwallowedFailureStep");
    expect(calls).not.toContain("rollbackStoreServerExtensionStep");
  });

  test("a failure that really is compensable still unwinds the stack", async () => {
    // The control. Swallowing the email must not have made the workflow
    // swallow anything else: a step that fails before the extension is
    // complete still rolls it back and still surfaces its own error.
    failing.add("performGuestActionStep");

    await expect(extendServerWorkflow({ serverId: "kvm_1" })).rejects.toThrow(
      /performGuestActionStep is unavailable/,
    );

    expect(calls).toContain("rollbackStoreServerExtensionStep");
  });

  test("one failing compensation does not skip the rest", async () => {
    // WF-4, end to end in a real workflow: the newest compensation throws and
    // the older one - the write that actually has to be undone - still runs.
    failing.add("performGuestActionStep");
    failing.add("rollbackApplyGuestConfigStep");

    await extendServerWorkflow({ serverId: "kvm_1" }).catch(() => {});

    expect(calls).toContain("rollbackApplyGuestConfigStep");
    expect(calls).toContain("reportRollbackFailureStep");
    expect(calls).toContain("rollbackStoreServerExtensionStep");
  });
});
