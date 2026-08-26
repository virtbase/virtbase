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

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { mockSession, seedServerGraph } from "../../../testing/fixtures";

let db: TestDb;
let anonymizeUserStep: typeof import("../anonymize-user").anonymizeUserStep;

const USER_ID = mockSession.user.id;
const EMAIL = mockSession.user.email;

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));
  ({ anonymizeUserStep } = await import("../anonymize-user"));

  await seedServerGraph(db);

  await db.insert(schema.sshKeys).values({
    userId: USER_ID,
    name: "laptop",
    fingerprint: "SHA256:abc",
    publicKey: "ssh-ed25519 AAAAC3Nz laptop",
  });
  await db.insert(schema.accounts).values({
    accountId: "discord-1",
    providerId: "discord",
    issuer: "https://discord.com",
    userId: USER_ID,
    accessToken: "a-live-token",
    password: "$argon2id$hash",
  });
  await db.insert(schema.sessions).values({
    userId: USER_ID,
    token: "session-token",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await db.insert(schema.orders).values({
    id: "ord_1",
    userId: USER_ID,
    type: "new_server",
    status: "fulfilled",
    totalAmount: 1000,
    billingAddress: { line1: "Musterstraße 1", city: "Berlin" },
    configuration: {
      type: "new_server",
      server_plan_id: "plan_1",
      new_ssh_key: "ssh-ed25519 AAAAC3Nz laptop",
      ssh_key_id: "sshkey_1",
    },
    rootPasswordCiphertext: "leftover-ciphertext",
  });
  await db.insert(schema.invoices).values({
    userId: USER_ID,
    lexwareInvoiceId: "11111111-1111-1111-1111-111111111111",
    number: "RE-1",
    total: 1000,
    taxAmount: 190,
    reverseCharge: false,
  });
  await db.insert(schema.emails).values({
    from: "system@virtbase.com",
    to: [EMAIL],
    subject: "Your server is ready",
    html: "<p>secrets inside</p>",
    text: "secrets inside",
  });
});

afterAll(async () => {
  await db.$client.close();
});

describe("anonymizeUserStep", () => {
  test("it reports what it destroyed", async () => {
    const destroyed = await anonymizeUserStep({
      userId: USER_ID,
      email: EMAIL,
    });

    expect(destroyed.sshKeys).toBe(1);
    expect(destroyed.linkedAccounts).toBe(1);
    expect(destroyed.sessions).toBe(1);
    expect(destroyed.scrubbedOrders).toBe(1);
    expect(destroyed.redactedEmails).toBe(1);
  });

  test("the original email address is unrecoverable", async () => {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, USER_ID));

    expect(user?.email).toBe(`deleted+${USER_ID}@invalid`);
    expect(user?.name).toBe("Deleted user");
    expect(user?.anonymizedAt).toBeDate();
    expect(JSON.stringify(user)).not.toContain(EMAIL);
  });

  test("the tombstone can never route", async () => {
    // RFC 2606 reserves `.invalid` precisely so it cannot resolve. A constant
    // would also collide with the unique index on the second deletion.
    const [user] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, USER_ID));

    expect(user?.email).toEndWith("@invalid");
  });

  test("credentials are gone, not merely detached", async () => {
    const [accounts, passkeys, keys] = await Promise.all([
      db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, USER_ID)),
      db
        .select()
        .from(schema.passkeys)
        .where(eq(schema.passkeys.userId, USER_ID)),
      db
        .select()
        .from(schema.sshKeys)
        .where(eq(schema.sshKeys.userId, USER_ID)),
    ]);

    expect(accounts).toEqual([]);
    expect(passkeys).toEqual([]);
    expect(keys).toEqual([]);
  });

  test("the invoice survives, and still joins to its user", async () => {
    // The whole reason this is anonymisation rather than deletion: `invoices`
    // cascades from `users.id`, so a DELETE would take the accounting record
    // the tax office requires.
    const rows = await db
      .select({
        number: schema.invoices.number,
        userId: schema.invoices.userId,
      })
      .from(schema.invoices)
      .innerJoin(schema.users, eq(schema.invoices.userId, schema.users.id))
      .where(eq(schema.invoices.userId, USER_ID));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.number).toBe("RE-1");
  });

  test("the order is retained but stripped of personal data", async () => {
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, "ord_1"));

    expect(order).toBeDefined();
    expect(order?.billingAddress).toBeNull();
    expect(order?.rootPasswordCiphertext).toBeNull();
    // The plan lines stay - they are what the invoice was built from - but the
    // customer's public key has no business in a booking document.
    expect(JSON.stringify(order?.configuration)).not.toContain("ssh-ed25519");
    expect(order?.configuration).toHaveProperty("server_plan_id");
  });

  test("email bodies are redacted while the record of sending stays", async () => {
    const [mail] = await db
      .select()
      .from(schema.emails)
      .where(eq(schema.emails.subject, "Your server is ready"));

    expect(mail?.html).toBeNull();
    expect(mail?.text).toBeNull();
    // Subject and timestamp remain: some of these are commercial letters with
    // a retention period of their own.
    expect(mail?.subject).toBe("Your server is ready");
    expect(mail?.createdAt).toBeDate();
  });

  test("running it twice is harmless", async () => {
    const again = await anonymizeUserStep({ userId: USER_ID, email: EMAIL });

    expect(again.sshKeys).toBe(0);
    expect(again.sessions).toBe(0);
  });
});
