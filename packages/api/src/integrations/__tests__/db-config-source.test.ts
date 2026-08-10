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

import { beforeEach, describe, expect, test } from "bun:test";
import type { ConfigDatabase } from "@virtbase/config";
import { generateKey, IntegrationConfigStore } from "@virtbase/config";
import { createTestDb } from "@virtbase/db/test-client";
import type { Integration } from "@virtbase/integration-sdk";
import { defineIntegration, EnvConfigSource } from "@virtbase/integration-sdk";
import * as z from "zod";
import { DbConfigSource } from "../db-config-source";
import { importIntegrationsFromEnv } from "../import-from-env";

const acme: Integration = defineIntegration({
  id: "acme",
  name: "Acme",
  description: "test integration",
  category: "platform",
  settings: {
    schema: z.object({ apiUrl: z.string() }),
    fields: [
      { key: "apiUrl", label: "API URL", widget: "url", env: "ACME_API_URL" },
    ],
  },
  secrets: {
    schema: z.object({ apiKey: z.string() }),
    fields: [
      {
        key: "apiKey",
        label: "API key",
        widget: "password",
        env: "ACME_API_KEY",
      },
    ],
  },
  provides: {},
});

const env = {
  ACME_API_URL: "https://acme.example.com",
  ACME_API_KEY: "env-key",
};

let store: IntegrationConfigStore;
let source: DbConfigSource;

beforeEach(async () => {
  const db = await createTestDb();
  store = new IntegrationConfigStore({
    db: db as unknown as ConfigDatabase,
    masterKey: generateKey(),
  });
  source = new DbConfigSource({
    store,
    fallback: new EnvConfigSource(env),
  });
});

describe("DbConfigSource", () => {
  test("falls back to the environment before anything is imported", async () => {
    // This is the property that makes deploying the store a no-op.
    expect(await source.isEnabled(acme)).toBe(true);
    expect(await source.settings(acme)).toEqual({
      apiUrl: "https://acme.example.com",
    });
    expect(await source.secrets(acme)).toEqual({ apiKey: "env-key" });
  });

  test("a stored row wins over the environment", async () => {
    await store.upsert({
      integrationId: "acme",
      enabled: true,
      settings: { apiUrl: "https://stored.example.com" },
    });
    await store.setSecrets("acme", { apiKey: "stored-key" });

    expect(await source.settings(acme)).toEqual({
      apiUrl: "https://stored.example.com",
    });
    expect(await source.secrets(acme)).toEqual({ apiKey: "stored-key" });
  });

  test("a stored row that disables the integration is respected", async () => {
    // Turning something off in admin must not be undone by a stale env var.
    await store.upsert({ integrationId: "acme", enabled: false });

    expect(await source.isEnabled(acme)).toBe(false);
  });

  test("an integration with no env and no row is simply off", async () => {
    const empty = new DbConfigSource({
      store,
      fallback: new EnvConfigSource({}),
    });

    expect(await empty.isEnabled(acme)).toBe(false);
  });

  test("without a fallback, an unimported integration is off", async () => {
    const strict = new DbConfigSource({ store });

    expect(await strict.isEnabled(acme)).toBe(false);
    expect(await strict.settings(acme)).toEqual({});
  });
});

describe("importIntegrationsFromEnv", () => {
  test("resolves identically before and after importing", async () => {
    const before = {
      enabled: await source.isEnabled(acme),
      settings: await source.settings(acme),
      secrets: await source.secrets(acme),
    };

    await importIntegrationsFromEnv({
      store,
      integrations: [acme],
      env,
    });

    expect({
      enabled: await source.isEnabled(acme),
      settings: await source.settings(acme),
      secrets: await source.secrets(acme),
    }).toEqual(before);
  });

  test("dry run writes nothing", async () => {
    const results = await importIntegrationsFromEnv({
      store,
      integrations: [acme],
      env,
      dryRun: true,
    });

    expect(results[0]?.action).toBe("imported");
    expect(await store.find("acme")).toBeNull();
  });

  test("is idempotent and never reverts an admin edit", async () => {
    await importIntegrationsFromEnv({ store, integrations: [acme], env });

    await store.upsert({
      integrationId: "acme",
      settings: { apiUrl: "https://edited-in-admin.example.com" },
    });

    const second = await importIntegrationsFromEnv({
      store,
      integrations: [acme],
      env,
    });

    expect(second[0]?.action).toBe("skipped-existing");
    expect(await source.settings(acme)).toEqual({
      apiUrl: "https://edited-in-admin.example.com",
    });
  });

  test("creates no row for an integration the environment does not configure", async () => {
    const results = await importIntegrationsFromEnv({
      store,
      integrations: [acme],
      env: {},
    });

    expect(results[0]?.action).toBe("skipped-unconfigured");
    expect(await store.find("acme")).toBeNull();
  });
});
