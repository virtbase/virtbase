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
import { eq } from "@virtbase/db";
import { integrationInstallations } from "@virtbase/db/schema";
import { createTestDb } from "@virtbase/db/test-client";
import { generateKey } from "../crypto";
import { IntegrationConfigStore } from "../integration-store";
import type { ConfigDatabase } from "../types";

const newStore = async () => {
  const db = await createTestDb();
  return {
    db,
    store: new IntegrationConfigStore({
      db: db as unknown as ConfigDatabase,
      masterKey: generateKey(),
    }),
  };
};

/**
 * A partial write must never turn an integration off. Getting this wrong would
 * silently disable a capability in production, which is the sort of thing
 * nobody notices until reverse DNS stops resolving.
 */
describe("partial writes preserve unrelated state", () => {
  test("recordHealth does not disturb the enabled flag or settings", async () => {
    const { db, store } = await newStore();

    await store.upsert({
      integrationId: "acme",
      enabled: true,
      settings: { apiUrl: "https://acme.example.com" },
    });
    await store.recordHealth("acme", {
      status: "ok",
      message: null,
      checkedAt: new Date(),
    });

    const row = await db
      .select()
      .from(integrationInstallations)
      .where(eq(integrationInstallations.integrationId, "acme"))
      .then(([first]) => first);

    expect(row?.enabled).toBe(true);
    expect(row?.settings).toEqual({ apiUrl: "https://acme.example.com" });
  });

  test("upsert without `enabled` does not disable an enabled integration", async () => {
    const { store } = await newStore();

    await store.upsert({ integrationId: "acme", enabled: true });
    await store.upsert({ integrationId: "acme", settings: { a: 2 } });

    expect(await store.find("acme")).toEqual({
      integrationId: "acme",
      enabled: true,
      settings: { a: 2 },
    });
  });

  test("upsert without `settings` does not blank stored settings", async () => {
    const { store } = await newStore();

    await store.upsert({ integrationId: "acme", settings: { a: 1 } });
    await store.upsert({ integrationId: "acme", enabled: true });

    expect((await store.find("acme"))?.settings).toEqual({ a: 1 });
  });
});
