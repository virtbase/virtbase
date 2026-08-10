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
import type { DnsProvider } from "@virtbase/ports";
import * as z from "zod";
import { EnvConfigSource } from "../config-source";
import { defineIntegration } from "../define-integration";
import { IntegrationRegistry, PortUnavailableError } from "../registry";
import type { IntegrationLogger } from "../types";

const silentLogger: IntegrationLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const fakeDns = (label: string): DnsProvider => ({
  upsertPointerRecord: async () => {},
  deletePointerRecords: async () => {},
  // biome-ignore lint/suspicious/noExplicitAny: test-only marker for identity assertions
  ...({ label } as any),
});

const dnsIntegration = (id: string) =>
  defineIntegration({
    id,
    name: id,
    description: `${id} test integration`,
    category: "platform",
    settings: {
      schema: z.object({ apiUrl: z.url() }),
      fields: [
        {
          key: "apiUrl",
          label: "API URL",
          widget: "url",
          env: `${id.toUpperCase()}_API_URL`,
        },
      ],
    },
    secrets: {
      schema: z.object({ apiKey: z.string().min(1) }),
      fields: [
        {
          key: "apiKey",
          label: "API key",
          widget: "password",
          env: `${id.toUpperCase()}_API_KEY`,
        },
      ],
    },
    provides: { dns: () => fakeDns(id) },
  });

const registryWith = (
  env: Record<string, string | undefined>,
  ids = ["alpha"],
) =>
  new IntegrationRegistry({
    integrations: ids.map(dnsIntegration),
    config: new EnvConfigSource(env),
    logger: silentLogger,
  });

describe("IntegrationRegistry", () => {
  test("resolves a port when the environment configures the integration", async () => {
    const registry = registryWith({
      ALPHA_API_URL: "https://dns.example.com",
      ALPHA_API_KEY: "secret",
    });

    expect(await registry.resolve("dns")).not.toBeNull();
  });

  test("returns null when the integration is not configured", async () => {
    // The same rule the old `process.env.X ? new Client() : null` applied.
    const registry = registryWith({ ALPHA_API_URL: "https://dns.example.com" });

    expect(await registry.resolve("dns")).toBeNull();
  });

  test("returns null for a port nothing provides", async () => {
    const registry = registryWith({
      ALPHA_API_URL: "https://dns.example.com",
      ALPHA_API_KEY: "secret",
    });

    expect(await registry.resolve("payment")).toBeNull();
  });

  test("require throws rather than returning null", async () => {
    const registry = registryWith({});

    await expect(registry.require("dns")).rejects.toBeInstanceOf(
      PortUnavailableError,
    );
  });

  test("refuses to guess when two integrations fill the same slot", async () => {
    const registry = registryWith(
      {
        ALPHA_API_URL: "https://a.example.com",
        ALPHA_API_KEY: "a",
        BETA_API_URL: "https://b.example.com",
        BETA_API_KEY: "b",
      },
      ["alpha", "beta"],
    );

    await expect(registry.resolve("dns")).rejects.toBeInstanceOf(
      PortUnavailableError,
    );
    expect(await registry.resolveAll("dns")).toHaveLength(2);
    expect(
      await registry.resolve("dns", { integrationId: "beta" }),
    ).toMatchObject({ label: "beta" });
  });

  test("reports invalid configuration through health instead of throwing", async () => {
    const registry = registryWith({
      ALPHA_API_URL: "not-a-url",
      ALPHA_API_KEY: "secret",
    });

    expect(await registry.resolve("dns")).toBeNull();
    expect(await registry.health()).toMatchObject({
      alpha: { status: "error" },
    });
  });

  test("caches the adapter until the integration is invalidated", async () => {
    const registry = registryWith({
      ALPHA_API_URL: "https://dns.example.com",
      ALPHA_API_KEY: "secret",
    });

    const first = await registry.resolve("dns");
    expect(await registry.resolve("dns")).toBe(first);

    registry.invalidate("alpha");
    expect(await registry.resolve("dns")).not.toBe(first);
  });
});
