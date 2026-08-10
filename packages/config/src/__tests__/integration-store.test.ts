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

import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  integrationInstallations,
  integrationSecrets,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { generateKey } from "../crypto";
import { IntegrationConfigStore } from "../integration-store";
import type { ConfigDatabase } from "../types";

let db: TestDb;
let store: IntegrationConfigStore;
const masterKey = generateKey();

beforeAll(async () => {
  db = await createTestDb();
  store = new IntegrationConfigStore({
    db: db as unknown as ConfigDatabase,
    masterKey,
  });
});

describe("IntegrationConfigStore", () => {
  test("returns null for an integration that was never installed", async () => {
    expect(await store.find("never-installed")).toBeNull();
    expect(await store.secrets("never-installed")).toEqual({});
  });

  test("stores settings and the enabled flag", async () => {
    await store.upsert({
      integrationId: "powerdns",
      enabled: true,
      settings: { apiUrl: "https://ns1.example.com:8081" },
    });

    expect(await store.find("powerdns")).toEqual({
      integrationId: "powerdns",
      enabled: true,
      settings: { apiUrl: "https://ns1.example.com:8081" },
    });
  });

  test("upsert leaves untouched fields alone", async () => {
    await store.upsert({ integrationId: "powerdns", enabled: false });

    const installation = await store.find("powerdns");
    expect(installation?.enabled).toBe(false);
    // Settings were not passed, so they must survive.
    expect(installation?.settings).toEqual({
      apiUrl: "https://ns1.example.com:8081",
    });
  });

  test("round-trips secrets through envelope encryption", async () => {
    await store.setSecrets("powerdns", { apiKey: "not-a-real-key" });

    expect(await store.secrets("powerdns")).toEqual({
      apiKey: "not-a-real-key",
    });
  });

  test("never stores a secret in plaintext", async () => {
    const rows = await db
      .select({ ciphertext: integrationSecrets.ciphertext })
      .from(integrationSecrets);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.ciphertext).not.toContain("not-a-real-key");
    }
  });

  test("reports which secrets are set without decrypting them", async () => {
    expect(await store.secretKeys("powerdns")).toEqual(["apiKey"]);
  });

  test("updates one secret without disturbing the others", async () => {
    await store.setSecrets("powerdns", { extra: "second-value" });
    await store.setSecrets("powerdns", { apiKey: "rotated-key" });

    expect(await store.secrets("powerdns")).toEqual({
      apiKey: "rotated-key",
      extra: "second-value",
    });
  });

  test("deletes a single secret", async () => {
    await store.deleteSecret("powerdns", "extra");

    expect(await store.secrets("powerdns")).toEqual({ apiKey: "rotated-key" });
  });

  test("refuses to store secrets for an integration that is not installed", async () => {
    await expect(
      store.setSecrets("not-installed", { apiKey: "x" }),
    ).rejects.toThrow(/not installed/);
  });

  test("a different master key cannot read the secrets", async () => {
    const intruder = new IntegrationConfigStore({
      db: db as unknown as ConfigDatabase,
      masterKey: generateKey(),
    });

    await expect(intruder.secrets("powerdns")).rejects.toThrow();
  });

  test("records health", async () => {
    const checkedAt = new Date();
    await store.recordHealth("powerdns", {
      status: "error",
      message: "unreachable",
      checkedAt,
    });

    const row = await db
      .select()
      .from(integrationInstallations)
      .where(eq(integrationInstallations.integrationId, "powerdns"))
      .then(([first]) => first);

    expect(row?.healthStatus).toBe("error");
    expect(row?.healthMessage).toBe("unreachable");
  });
});
