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

import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  ServerManagementActor,
  ServerManagementPort,
} from "@virtbase/ports";
import { ServerManagementError } from "@virtbase/ports";

// next-intl's server entry needs a Next.js request scope and a resolved i18n
// config, neither of which exists in a bare test process. Stubbing it is the
// point of these tests: with the tRPC caller gone, message rendering is a
// Discord handler's only remaining tie to the application.
beforeAll(() => {
  mock.module("next-intl/server", () => ({
    getExtracted: async () => (message: string) => message,
    getFormatter: async () => ({ number: (value: number) => String(value) }),
  }));
});

const { handleButtonComponent } = await import("../button-component");
const { handleStringSelectComponent } = await import("../string-select");

const user = { id: "usr_1", name: "Test", email: "test@example.com" } as never;

type Call = { method: string; actor: ServerManagementActor; input: unknown };

/** Records what a handler asked for, and answers with whatever we hand it. */
const fakePort = (results: Partial<Record<string, unknown>> = {}) => {
  const calls: Call[] = [];

  const record =
    (method: string, fallback: unknown) =>
    async (actor: ServerManagementActor, input: unknown) => {
      calls.push({ method, actor, input });
      const result = results[method] ?? fallback;
      if (result instanceof Error) throw result;
      return result;
    };

  const port = {
    list: record("list", { servers: [], meta: { pagination: {} } }),
    get: record("get", { server: { id: "srv_1", name: "one" } }),
    console: record("console", "https://novnc.com/x"),
    resetPassword: record("resetPassword", undefined),
  } as unknown as ServerManagementPort;

  return { port, calls };
};

describe("handleButtonComponent", () => {
  test("asks the port for the acting user's servers", async () => {
    const { port, calls } = fakePort();

    await handleButtonComponent({
      interaction: {
        locale: "en",
        data: { custom_id: "button:manage-servers-menu" },
      } as never,
      user,
      servers: port,
    });

    expect(calls).toEqual([
      {
        method: "list",
        actor: { userId: "usr_1" },
        input: { page: 1, per_page: 25, expand: ["plan"] },
      },
    ]);
  });

  test("does not touch the port when the account is not linked", async () => {
    const { port, calls } = fakePort();

    await handleButtonComponent({
      interaction: {
        locale: "en",
        data: { custom_id: "button:manage-servers-menu" },
      } as never,
      user: null,
      servers: port,
    });

    expect(calls).toEqual([]);
  });
});

describe("handleStringSelectComponent", () => {
  test("falls back to the main menu when the server is gone", async () => {
    // Previously this branch keyed on `error instanceof TRPCError`, which is
    // what forced a dependency on @virtbase/api.
    const { port } = fakePort({
      get: new ServerManagementError("not_found", "Server does not exist"),
    });

    const response = await handleStringSelectComponent({
      interaction: {
        locale: "en",
        data: { custom_id: "string-select:servers-list", values: ["srv_1"] },
      } as never,
      user,
      servers: port,
    });

    expect(response).toBeTruthy();
  });

  test("propagates errors that are not server-management failures", async () => {
    const { port } = fakePort({ get: new Error("network exploded") });

    await expect(
      handleStringSelectComponent({
        interaction: {
          locale: "en",
          data: { custom_id: "string-select:servers-list", values: ["srv_1"] },
        } as never,
        user,
        servers: port,
      }),
    ).rejects.toThrow("network exploded");
  });
});
