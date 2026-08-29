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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  notificationTargetSecrets,
  notificationTargets,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { generateKey } from "../crypto";
import { NotificationTargetStore } from "../notification-target-store";
import type { ConfigDatabase } from "../types";

let db: TestDb;
let store: NotificationTargetStore;
const masterKey = generateKey();

beforeAll(async () => {
  db = await createTestDb();
  store = new NotificationTargetStore({
    db: db as unknown as ConfigDatabase,
    masterKey,
  });
});

afterAll(async () => {
  // PGlite holds the event loop open; without this the process is force-killed
  // with exit code 99 even though every test passed.
  await db.$client.close();
});

describe("NotificationTargetStore", () => {
  test("returns null for a target that does not exist", async () => {
    expect(await store.find("ntft_missing")).toBeNull();
  });

  test("creates a target with its routing rules", async () => {
    const id = await store.create({
      name: "Ops mailing list",
      channel: "email",
      matchKeys: ["abuse.*"],
      minSeverity: "warning",
      config: { recipients: "abuse@virtbase.com" },
    });

    const target = await store.find(id);

    expect(target).toMatchObject({
      name: "Ops mailing list",
      channel: "email",
      audience: "operator",
      enabled: true,
      matchKeys: ["abuse.*"],
      minSeverity: "warning",
    });
    expect(target?.config).toEqual({ recipients: "abuse@virtbase.com" });
  });

  test("round-trips a secret without storing it in the clear", async () => {
    const id = await store.create({
      name: "Ops Discord",
      channel: "discord",
      matchKeys: ["*"],
    });

    await store.setSecrets(id, {
      webhookUrl: "https://discord.test/hook/s3cr3t",
    });

    expect(await store.secrets(id)).toEqual({
      webhookUrl: "https://discord.test/hook/s3cr3t",
    });

    const [row] = await db
      .select({ ciphertext: notificationTargetSecrets.ciphertext })
      .from(notificationTargetSecrets)
      .where(eq(notificationTargetSecrets.targetId, id));

    expect(row?.ciphertext).toBeString();
    expect(row?.ciphertext).not.toContain("s3cr3t");
  });

  test("lists which secrets are set without decrypting them", async () => {
    const id = await store.create({
      name: "Webhook",
      channel: "webhook",
      matchKeys: ["*"],
    });
    await store.setSecrets(id, {
      signingSecret: "shhh",
      url: "https://x.test",
    });

    expect((await store.secretKeys(id)).sort()).toEqual([
      "signingSecret",
      "url",
    ]);
  });

  test("leaves an unnamed secret alone and deletes an explicit null", async () => {
    // This is what makes "blank means unchanged" work in the admin form: a
    // field the operator did not retype must not be wiped.
    const id = await store.create({
      name: "Partial",
      channel: "webhook",
      matchKeys: ["*"],
    });
    await store.setSecrets(id, {
      url: "https://x.test",
      signingSecret: "keep",
    });

    await store.setSecrets(id, { url: "https://y.test" });
    expect(await store.secrets(id)).toEqual({
      url: "https://y.test",
      signingSecret: "keep",
    });

    await store.setSecrets(id, { signingSecret: null });
    expect(await store.secrets(id)).toEqual({ url: "https://y.test" });
  });

  test("mints the data key only when a secret is first written", async () => {
    const id = await store.create({
      name: "No secrets",
      channel: "email",
      matchKeys: ["*"],
    });

    const before = await db
      .select({ wrappedDataKey: notificationTargets.wrappedDataKey })
      .from(notificationTargets)
      .where(eq(notificationTargets.id, id))
      .then(([first]) => first);

    expect(before?.wrappedDataKey).toBeNull();

    await store.setSecrets(id, { token: "t" });

    const after = await db
      .select({ wrappedDataKey: notificationTargets.wrappedDataKey })
      .from(notificationTargets)
      .where(eq(notificationTargets.id, id))
      .then(([first]) => first);

    expect(after?.wrappedDataKey).toBeString();
  });

  test("updates only the fields it is given", async () => {
    const id = await store.create({
      name: "Before",
      channel: "email",
      matchKeys: ["abuse.*"],
      minSeverity: "critical",
    });

    await store.update(id, { name: "After", enabled: false });

    expect(await store.find(id)).toMatchObject({
      name: "After",
      enabled: false,
      matchKeys: ["abuse.*"],
      minSeverity: "critical",
    });
  });

  test("deleting a target takes its secrets with it", async () => {
    const id = await store.create({
      name: "Doomed",
      channel: "webhook",
      matchKeys: ["*"],
    });
    await store.setSecrets(id, { url: "https://gone.test" });

    await store.remove(id);

    expect(await store.find(id)).toBeNull();
    expect(await store.secretKeys(id)).toEqual([]);
  });
});
