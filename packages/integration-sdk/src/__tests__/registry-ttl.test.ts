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
import { IntegrationRegistry } from "../registry";
import type { IntegrationLogger } from "../types";

const silentLogger: IntegrationLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** A config source an admin can "edit" mid-test. */
class MutableConfig implements ConfigSource {
  enabled = true;
  apiKey = "first";
  reads = 0;

  async isEnabled() {
    this.reads += 1;
    return this.enabled;
  }
  async settings() {
    return {};
  }
  async secrets() {
    return { apiKey: this.apiKey };
  }
}

const integration = defineIntegration({
  id: "acme",
  name: "Acme",
  description: "test",
  category: "platform",
  secrets: {
    schema: z.object({ apiKey: z.string() }),
    fields: [{ key: "apiKey", label: "API key", widget: "password" }],
  },
  provides: {
    dns: (ctx) =>
      ({
        upsertPointerRecord: async () => {},
        deletePointerRecords: async () => {},
        key: ctx.secrets.apiKey,
      }) as unknown as DnsProvider,
  },
});

const registryWith = (config: ConfigSource, configTtlMs: number) =>
  new IntegrationRegistry({
    integrations: [integration],
    config,
    logger: silentLogger,
    configTtlMs,
  });

describe("configuration TTL", () => {
  test("reuses configuration within the TTL", async () => {
    const config = new MutableConfig();
    const registry = registryWith(config, 60_000);

    await registry.resolve("dns");
    await registry.resolve("dns");

    expect(config.reads).toBe(1);
  });

  test("picks up a changed secret after the TTL expires", async () => {
    const config = new MutableConfig();
    const registry = registryWith(config, 1);

    const before = (await registry.resolve("dns")) as unknown as {
      key: string;
    };
    expect(before.key).toBe("first");

    config.apiKey = "rotated";
    await Bun.sleep(5);

    const after = (await registry.resolve("dns")) as unknown as { key: string };
    // A stale adapter would still hold the old credential.
    expect(after.key).toBe("rotated");
  });

  test("picks up an integration being disabled after the TTL expires", async () => {
    const config = new MutableConfig();
    const registry = registryWith(config, 1);

    expect(await registry.resolve("dns")).not.toBeNull();

    config.enabled = false;
    await Bun.sleep(5);

    expect(await registry.resolve("dns")).toBeNull();
  });

  test("caches forever when the TTL is Infinity", async () => {
    const config = new MutableConfig();
    const registry = registryWith(config, Number.POSITIVE_INFINITY);

    await registry.resolve("dns");
    config.apiKey = "rotated";
    const after = (await registry.resolve("dns")) as unknown as { key: string };

    expect(after.key).toBe("first");
    expect(config.reads).toBe(1);
  });
});
