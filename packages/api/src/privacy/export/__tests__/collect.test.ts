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
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { mockSession, seedServerGraph } from "../../../testing/fixtures";
import type { SubjectTableName } from "../../subject-data";
import {
  NEVER_EXPORTED_COLUMNS,
  SUBJECT_DATA,
  subjectTables,
} from "../../subject-data";
import { collectSubjectData, EXPORT_SCHEMA_VERSION } from "../collect";
import { EXPORT_SECTIONS } from "../sections";

let db: TestDb;
const USER_ID = mockSession.user.id;

/**
 * PGlite and Neon are different drivers with structurally different types, but
 * the queries the collector runs are plain SQL that both understand. The rest
 * of the suite reaches for the same `as never` for the same reason.
 */
const collect = (userId: string, now?: Date) =>
  collectSubjectData({ db: db as never, userId, now });

/**
 * The provider's own handle on a saved card, seeded so a test can go looking
 * for it in the finished file. It is the token an off-session charge is made
 * against; nothing that leaves this server may contain it.
 */
const CARD_TOKEN = "pm_1TokenThatMustNeverLeaveTheServer";

/** Exactly what a payment method is allowed to say in an export. */
const PAYMENT_METHOD_FIELDS = [
  "brand",
  "created_at",
  "detached_at",
  "exp_month",
  "exp_year",
  "id",
  "invalid_at",
  "is_default",
  "last4",
  "type",
];

beforeAll(async () => {
  db = await createTestDb();
  const { server, serverPlanPrice } = await seedServerGraph(db);

  // Enough of a footprint that every section has something in it - an empty
  // export would pass a completeness test without proving anything.
  await db.insert(schema.sshKeys).values({
    userId: USER_ID,
    name: "laptop",
    fingerprint: "SHA256:abc",
    publicKey: "ssh-ed25519 AAAAC3Nz laptop",
  });
  await db.insert(schema.accounts).values({
    accountId: "discord-123",
    providerId: "discord",
    issuer: "https://discord.com",
    userId: USER_ID,
    accessToken: "super-secret-access-token",
    refreshToken: "super-secret-refresh-token",
    password: "$argon2id$super-secret-hash",
    scope: "identify email",
  });
  await db.insert(schema.sessions).values({
    userId: USER_ID,
    token: "a-session-token-nobody-should-see",
    expiresAt: new Date(Date.now() + 86_400_000),
    ipAddress: "203.0.113.4",
    userAgent: "Mozilla/5.0",
  });
  await db.insert(schema.serverBackups).values({
    serverId: server.id,
    name: "nightly",
    upid: "UPID:node:0000:vzdump::",
  });
  await db.insert(schema.orders).values({
    id: "ord_test",
    userId: USER_ID,
    type: "new_server",
    status: "paid",
    totalAmount: 1000,
    configuration: { type: "new_server" },
    rootPasswordCiphertext: "very-secret-ciphertext",
  });
  await db.insert(schema.orderItems).values({
    orderId: "ord_test",
    name: "VPS S",
    quantity: 1,
    unitAmount: 1000,
  });
  await db.insert(schema.emails).values({
    from: "system@virtbase.com",
    to: [mockSession.user.email],
    subject: "Your server is ready",
    html: "<p>hello</p>",
  });
  await db.insert(schema.paymentMethods).values({
    id: "pm_test",
    userId: USER_ID,
    provider: "stripe",
    externalId: CARD_TOKEN,
    type: "card",
    brand: "visa",
    last4: "4242",
    expMonth: 12,
    expYear: 2030,
    isDefault: true,
  });
  await db.insert(schema.subscriptions).values({
    id: "sub_test",
    userId: USER_ID,
    subjectId: server.id,
    serverPlanPriceId: serverPlanPrice.id,
    paymentMethodId: "pm_test",
    currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
    mandateAcceptedAt: new Date("2026-08-01T00:00:00.000Z"),
    mandateTextVersion: "2026-08-01",
  });
  await db.insert(schema.subscriptionRenewals).values({
    subscriptionId: "sub_test",
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    amount: 3499,
    status: "failed",
    failureCode: "card_declined",
  });
});

afterAll(async () => {
  await db.$client.close();
});

describe("collectSubjectData", () => {
  test("it refuses to build an export for an unknown user", async () => {
    expect(collect("usr_does_not_exist")).rejects.toThrow(/unknown user/);
  });

  test("it stamps the schema version and the moment it was built", async () => {
    const at = new Date("2026-08-26T12:00:00.000Z");
    const result = await collect(USER_ID, at);

    expect(result.schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(result.generated_at).toBe("2026-08-26T12:00:00.000Z");
  });

  test("it returns the customer's own records", async () => {
    const result = await collect(USER_ID);

    expect(result.account.email).toBe(mockSession.user.email);
    expect(result.ssh_keys).toHaveLength(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.linked_accounts).toHaveLength(1);
    expect(result.servers).toHaveLength(1);
    expect(result.backups).toHaveLength(1);
    expect(result.emails).toHaveLength(1);
  });

  test("it nests order items inside the order they belong to", async () => {
    const result = await collect(USER_ID);

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.items).toHaveLength(1);
    expect(result.orders[0]?.items[0]?.name).toBe("VPS S");
  });

  test("it nests renewal attempts inside the subscription they belong to", async () => {
    const result = await collect(USER_ID);

    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0]?.mandate_text_version).toBe("2026-08-01");
    expect(result.subscriptions[0]?.renewals).toHaveLength(1);
    // The customer's side of a renewal that did not happen, which exists
    // nowhere else.
    expect(result.subscriptions[0]?.renewals[0]?.failure_code).toBe(
      "card_declined",
    );
  });

  test("it returns the saved card as display material", async () => {
    const result = await collect(USER_ID);

    expect(result.payment_methods).toHaveLength(1);
    expect(result.payment_methods[0]?.brand).toBe("visa");
    expect(result.payment_methods[0]?.last4).toBe("4242");
  });

  test("it holds up for a customer who has nothing", async () => {
    // The empty case reaches every `inArray` guard at once. Without them this
    // is where the collector would throw rather than return empty lists.
    await db.insert(schema.users).values({
      id: "usr_empty",
      name: "Nobody",
      email: "nobody@example.com",
    });

    const result = await collect("usr_empty");

    expect(result.servers).toEqual([]);
    expect(result.orders).toEqual([]);
    expect(result.backups).toEqual([]);
    expect(result.ip_addresses).toEqual([]);
    expect(result.reverse_dns).toEqual([]);
    expect(result.payment_methods).toEqual([]);
    // The `inArray` guard the renewals query needs: without it this is where
    // the collector would throw rather than return an empty list.
    expect(result.subscriptions).toEqual([]);
  });

  test("one customer's export never contains another's records", async () => {
    const result = await collect("usr_empty");

    expect(JSON.stringify(result)).not.toContain(mockSession.user.email);
    expect(result.ssh_keys).toEqual([]);
  });
});

describe("the export never leaks credentials", () => {
  test("no forbidden column name appears anywhere in the output", async () => {
    const result = await collect(USER_ID);
    const keys = new Set<string>();

    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          keys.add(key);
          walk(nested);
        }
      }
    };
    walk(result);

    const leaked = NEVER_EXPORTED_COLUMNS.filter((column) => keys.has(column));

    expect(leaked).toEqual([]);
  });

  test("a saved card's provider token never reaches the file", async () => {
    // The one that matters. `external_id` is the token an off-session charge
    // is made against and `provider` names the processor behind it; an export
    // is a file the customer downloads, keeps and forwards, so neither may be
    // in it. Asserted three ways so that adding either column back fails here
    // however it is spelled: the value is not in the bytes, the section's rows
    // carry exactly the fields they are allowed to carry, and no row admits a
    // `provider` or an `external_id` key.
    const result = await collect(USER_ID);

    expect(JSON.stringify(result)).not.toContain(CARD_TOKEN);

    for (const method of result.payment_methods) {
      expect(Object.keys(method).sort()).toEqual(PAYMENT_METHOD_FIELDS);
      expect(method).not.toHaveProperty("provider");
      expect(method).not.toHaveProperty("external_id");
      expect(method).not.toHaveProperty("externalId");
    }

    // Not vacuous: there really is a card in this export.
    expect(result.payment_methods).toHaveLength(1);
  });

  test("no seeded secret value survives serialisation", async () => {
    // The stronger of the two: a column renamed on its way out would slip past
    // the key check above but not past this one.
    const serialised = JSON.stringify(await collect(USER_ID));

    for (const secret of [
      "super-secret-access-token",
      "super-secret-refresh-token",
      "$argon2id$super-secret-hash",
      "a-session-token-nobody-should-see",
      "very-secret-ciphertext",
      CARD_TOKEN,
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });
});

describe("EXPORT_SECTIONS", () => {
  test("every exportable table lands in a section", async () => {
    // The link that keeps the export honest against `SUBJECT_DATA`: marking a
    // table exportable and then forgetting to collect it fails here.
    const names = Object.keys(SUBJECT_DATA) as SubjectTableName[];
    const missing = names.filter(
      (name) => subjectTables[name].exportable && !(name in EXPORT_SECTIONS),
    );

    expect(missing).toEqual([]);
  });

  test("no section is declared for a table that is not exportable", async () => {
    const declared = Object.keys(EXPORT_SECTIONS) as SubjectTableName[];
    const surplus = declared.filter((name) => !subjectTables[name].exportable);

    expect(surplus).toEqual([]);
  });

  test("every section actually appears in a collected export", async () => {
    const result = await collect(USER_ID);

    for (const section of new Set(Object.values(EXPORT_SECTIONS))) {
      expect(result).toHaveProperty(section);
    }
  });
});
