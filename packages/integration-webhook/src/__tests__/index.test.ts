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

import { describe, expect, test } from "bun:test";
import type { FetchLike } from "@virtbase/integration-sdk";
import { IntegrationRegistry } from "@virtbase/integration-sdk";
import webhook from "../index";

const silent = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("the webhook integration", () => {
  test("provides a notifications channel that core resolves through the registry and that posts through ctx.http", async () => {
    const requests: { url: string; method: string | undefined }[] = [];
    const endpoint: FetchLike = async (input, init) => {
      requests.push({ url: String(input), method: init?.method });
      return new Response(null, { status: 204 });
    };
    const registry = new IntegrationRegistry({
      integrations: [webhook],
      config: {
        isEnabled: async () => true,
        settings: async () => ({}),
        secrets: async () => ({}),
      },
      logger: silent,
      logSink: silent,
      fetch: endpoint,
    });

    const channel = await registry.resolve("notifications");
    if (!channel)
      throw new Error("the registry resolved no notifications channel");

    await channel.send({
      id: "ntfd_0000000000000000000000000",
      key: "abuse.case.opened",
      audience: { kind: "operator", targetId: "ntft_1" },
      severity: "warning",
      params: { title: "Case AB-1042 opened" },
      target: { url: "https://hooks.test/registry" },
      occurredAt: new Date("2026-10-11T00:00:00.000Z"),
    });

    expect(channel.id).toBe("webhook");
    expect(requests).toEqual([
      { url: "https://hooks.test/registry", method: "POST" },
    ]);
  });
});
