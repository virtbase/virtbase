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
import type { ConfigSource } from "../config-source";
import { defineIntegration } from "../define-integration";
import { IntegrationRegistry } from "../registry";
import type { IntegrationLogger, IntegrationWebhook } from "../types";

const silentLogger: IntegrationLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const inbound: IntegrationWebhook = {
  path: "events/inbound",
  methods: ["POST"],
  handler: async () => new Response("handled"),
};

const hooked = defineIntegration({
  id: "hooked",
  name: "Hooked",
  description: "An integration with one POST webhook.",
  category: "platform",
  provides: {},
  webhooks: [inbound],
});

const registryWith = (enabled: boolean) => {
  const config: ConfigSource = {
    isEnabled: async () => enabled,
    settings: async () => ({}),
    secrets: async () => ({}),
  };
  return new IntegrationRegistry({
    integrations: [hooked],
    config,
    logger: silentLogger,
  });
};

describe("IntegrationRegistry.resolveWebhook", () => {
  test("finds a declared webhook of an enabled integration", async () => {
    const resolved = await registryWith(true).resolveWebhook(
      "hooked",
      "events/inbound",
      "POST",
    );

    expect(resolved?.webhook).toBe(inbound);
    expect(resolved?.context.id).toBe("hooked");
  });

  test("returns null for a method the webhook does not declare", async () => {
    expect(
      await registryWith(true).resolveWebhook(
        "hooked",
        "events/inbound",
        "GET",
      ),
    ).toBeNull();
  });

  test("matches the method case-insensitively, because a request may carry it in lowercase", async () => {
    const resolved = await registryWith(true).resolveWebhook(
      "hooked",
      "events/inbound",
      "post",
    );

    expect(resolved?.webhook).toBe(inbound);
  });

  test("ignores leading and trailing slashes on the requested path", async () => {
    const resolved = await registryWith(true).resolveWebhook(
      "hooked",
      "//events/inbound/",
      "POST",
    );

    expect(resolved?.webhook).toBe(inbound);
  });

  test("returns null for a path the integration does not declare", async () => {
    expect(
      await registryWith(true).resolveWebhook("hooked", "events", "POST"),
    ).toBeNull();
  });

  test("returns null for an unknown integration", async () => {
    expect(
      await registryWith(true).resolveWebhook(
        "absent",
        "events/inbound",
        "POST",
      ),
    ).toBeNull();
  });

  test("returns null when the integration is disabled", async () => {
    expect(
      await registryWith(false).resolveWebhook(
        "hooked",
        "events/inbound",
        "POST",
      ),
    ).toBeNull();
  });

  test("hands the webhook the request's waitUntil instead of the registry's", async () => {
    const waitUntil = () => {};
    const resolved = await registryWith(true).resolveWebhook(
      "hooked",
      "events/inbound",
      "POST",
      { waitUntil },
    );

    expect(resolved?.context.waitUntil).toBe(waitUntil);
  });
});
