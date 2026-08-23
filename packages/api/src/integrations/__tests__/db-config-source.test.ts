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
import { defineIntegration } from "@virtbase/integration-sdk";
import * as z from "zod";
import { DbConfigSource } from "../db-config-source";

const acme: Integration = defineIntegration({
  id: "acme",
  name: "Acme",
  description: "test integration",
  category: "platform",
  settings: {
    schema: z.object({ apiUrl: z.string() }),
    fields: [{ key: "apiUrl", label: "API URL", widget: "url" }],
  },
  secrets: {
    schema: z.object({ apiKey: z.string() }),
    fields: [{ key: "apiKey", label: "API key", widget: "password" }],
  },
  provides: {},
});

let store: IntegrationConfigStore;
let source: DbConfigSource;

beforeEach(async () => {
  const db = await createTestDb();
  store = new IntegrationConfigStore({
    db: db as unknown as ConfigDatabase,
    masterKey: generateKey(),
  });
  source = new DbConfigSource({ store });
});

describe("DbConfigSource", () => {
  test("serves what an administrator stored", async () => {
    await store.upsert({
      integrationId: "acme",
      enabled: true,
      settings: { apiUrl: "https://stored.example.com" },
    });
    await store.setSecrets("acme", { apiKey: "stored-key" });

    expect(await source.isEnabled(acme)).toBe(true);
    expect(await source.settings(acme)).toEqual({
      apiUrl: "https://stored.example.com",
    });
    expect(await source.secrets(acme)).toEqual({ apiKey: "stored-key" });
  });

  test("an integration with no row is off", async () => {
    // The store is the only source. There is no environment to fall back to,
    // so an integration nobody has configured is simply not available.
    expect(await source.isEnabled(acme)).toBe(false);
    expect(await source.settings(acme)).toEqual({});
    expect(await source.secrets(acme)).toEqual({});
  });

  test("a stored row that disables the integration is respected", async () => {
    await store.upsert({
      integrationId: "acme",
      enabled: false,
      settings: { apiUrl: "https://stored.example.com" },
    });
    await store.setSecrets("acme", { apiKey: "stored-key" });

    expect(await source.isEnabled(acme)).toBe(false);
  });

  test("an installed integration with no secrets yet reads as empty", async () => {
    // Half-configured is a real state: the row is created before the secrets
    // are filled in. It must read as empty rather than throwing, so the
    // registry can report it through health.
    await store.upsert({ integrationId: "acme", enabled: true });

    expect(await source.secrets(acme)).toEqual({});
  });
});
