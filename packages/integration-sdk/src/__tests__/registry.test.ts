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
import type { ConfigSource } from "../config-source";
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
      fields: [{ key: "apiUrl", label: "API URL", widget: "url" }],
    },
    secrets: {
      schema: z.object({ apiKey: z.string().min(1) }),
      fields: [{ key: "apiKey", label: "API key", widget: "password" }],
    },
    provides: { dns: () => fakeDns(id) },
  });

interface Stored {
  enabled?: boolean;
  settings?: unknown;
  secrets?: unknown;
}

/**
 * Stands in for the Postgres-backed store. The registry only cares about the
 * three questions a `ConfigSource` answers, so a plain object is enough and
 * keeps these tests about wiring rather than about storage.
 */
const staticConfig = (entries: Record<string, Stored>): ConfigSource => ({
  isEnabled: async (integration) => entries[integration.id]?.enabled ?? false,
  settings: async (integration) => entries[integration.id]?.settings ?? {},
  secrets: async (integration) => entries[integration.id]?.secrets ?? {},
});

/** An enabled integration whose configuration passes its own schema. */
const configured = (id: string): Stored => ({
  enabled: true,
  settings: { apiUrl: `https://${id}.example.com` },
  secrets: { apiKey: id },
});

const registryWith = (entries: Record<string, Stored>, ids = ["alpha"]) =>
  new IntegrationRegistry({
    integrations: ids.map(dnsIntegration),
    config: staticConfig(entries),
    logger: silentLogger,
  });

describe("IntegrationRegistry", () => {
  test("resolves a port when the integration is enabled and configured", async () => {
    const registry = registryWith({ alpha: configured("alpha") });

    expect(await registry.resolve("dns")).not.toBeNull();
  });

  test("returns null when an administrator has it switched off", async () => {
    const registry = registryWith({
      alpha: { ...configured("alpha"), enabled: false },
    });

    expect(await registry.resolve("dns")).toBeNull();
  });

  test("returns null when the stored configuration is incomplete", async () => {
    // Enabled, but the secret was never filled in — a real state, because the
    // row is created before the admin form is submitted.
    const registry = registryWith({
      alpha: { enabled: true, settings: { apiUrl: "https://a.example.com" } },
    });

    expect(await registry.resolve("dns")).toBeNull();
  });

  test("returns null for a port nothing provides", async () => {
    const registry = registryWith({ alpha: configured("alpha") });

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
      { alpha: configured("alpha"), beta: configured("beta") },
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
      alpha: {
        enabled: true,
        settings: { apiUrl: "not-a-url" },
        secrets: { apiKey: "secret" },
      },
    });

    expect(await registry.resolve("dns")).toBeNull();
    expect(await registry.health()).toMatchObject({
      alpha: { status: "error" },
    });
  });

  test("caches the adapter until the integration is invalidated", async () => {
    const registry = registryWith({ alpha: configured("alpha") });

    const first = await registry.resolve("dns");
    expect(await registry.resolve("dns")).toBe(first);

    registry.invalidate("alpha");
    expect(await registry.resolve("dns")).not.toBe(first);
  });
});
