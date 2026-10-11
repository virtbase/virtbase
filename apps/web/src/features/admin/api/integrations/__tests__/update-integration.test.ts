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

import { beforeEach, describe, expect, mock, test } from "bun:test";

/** Every call the action makes to the store and the registry, in order. */
const calls: string[] = [];
let failingHook: "enable" | "disable" | "disable-falsy" | null = null;

const integrations = {
  find: (id: string) => (id === "discord" ? { id } : undefined),
  invalidate: (id: string) => {
    calls.push(`invalidate ${id}`);
  },
  runEnableHook: async (id: string) => {
    calls.push(`onEnable ${id}`);
    if (failingHook === "enable") throw new Error("slash commands rejected");
  },
  runDisableHook: async (id: string) => {
    calls.push(`onDisable ${id}`);
    if (failingHook === "disable") throw new Error("Discord unreachable");
    if (failingHook === "disable-falsy") throw "";
  },
  health: async () => {
    calls.push("health of all");
    return {};
  },
  healthOf: async (id: string) => {
    calls.push(`health of ${id}`);
    return {
      status: "ok" as const,
      checkedAt: new Date("2026-10-11T00:00:00Z"),
    };
  },
};

const integrationConfigStore = {
  upsert: async ({ enabled }: { integrationId: string; enabled?: boolean }) => {
    calls.push(`store enabled=${enabled}`);
  },
  recordHealth: async (id: string) => {
    calls.push(`record health ${id}`);
  },
};

mock.module("@virtbase/api/integrations", () => ({
  integrations,
  integrationConfigStore,
}));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("@sentry/nextjs", () => ({
  captureException: () => {},
  setUser: () => {},
}));
mock.module("../../verify-session", () => ({
  verifySession: async () => ({
    session: { id: "ses_admin" },
    user: { id: "usr_admin", email: "admin@virtbase.test", name: "Admin" },
  }),
}));

const { checkIntegrationHealthAction, setIntegrationEnabledAction } =
  await import("../update-integration");

beforeEach(() => {
  calls.length = 0;
  failingHook = null;
});

describe("setIntegrationEnabledAction", () => {
  test("runs onDisable before it stores the flag, so the hook sees the integration enabled", async () => {
    await setIntegrationEnabledAction({
      integrationId: "discord",
      enabled: false,
    });

    expect(calls).toEqual([
      "onDisable discord",
      "store enabled=false",
      "invalidate discord",
      "invalidate discord",
    ]);
  });

  test("runs onEnable after it stores the flag", async () => {
    await setIntegrationEnabledAction({
      integrationId: "discord",
      enabled: true,
    });

    expect(calls).toEqual([
      "store enabled=true",
      "invalidate discord",
      "onEnable discord",
      "invalidate discord",
    ]);
  });

  test("switches the integration off even when onDisable fails, and reports the failure", async () => {
    failingHook = "disable";

    const result = await setIntegrationEnabledAction({
      integrationId: "discord",
      enabled: false,
    });

    expect(calls).toContain("store enabled=false");
    expect(result?.serverError).toBe(
      "Saved, but the disable hook failed: Discord unreachable",
    );
  });

  test("reports a hook failure even when the hook throws a falsy value", async () => {
    failingHook = "disable-falsy";

    const result = await setIntegrationEnabledAction({
      integrationId: "discord",
      enabled: false,
    });

    expect(result?.serverError).toBe("Saved, but the disable hook failed: ");
  });
});

describe("checkIntegrationHealthAction", () => {
  test("probes and records only the integration asked about (C4)", async () => {
    const result = await checkIntegrationHealthAction({
      integrationId: "discord",
    });

    expect(calls).toEqual([
      "invalidate discord",
      "health of discord",
      "record health discord",
    ]);
    expect(result?.data).toEqual({ status: "ok", message: null });
  });
});
