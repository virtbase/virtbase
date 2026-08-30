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
import { collectSubjectData } from "../../../privacy/export/collect";
import type { ExportSection } from "../../../privacy/export/sections";
import { EXPORT_SECTIONS } from "../../../privacy/export/sections";
import type { SubjectTableName } from "../../../privacy/subject-data";
import { tablesToErase } from "../../../privacy/subject-data";
import {
  mockProxmoxNode,
  mockServer,
  mockSession,
  seedServerGraph,
} from "../../../testing/fixtures";

let db: TestDb;

type Steps = {
  anonymizeUser: typeof import("../anonymize-user").anonymizeUserStep;
  claimAccount: typeof import("../claim-account").claimAccountStep;
  eraseSubjectData: typeof import("../erase-subject-data").eraseSubjectDataStep;
  unplannedErasures: typeof import("../erasure-plan").unplannedErasures;
  getServersToDestroy: typeof import("../get-servers-to-destroy").getServersToDestroyStep;
  purgeAllBackups: typeof import("../../delete-server/purge-all-backups").purgeAllBackupsStep;
  purgeIsoDownloads: typeof import("../purge-iso-downloads").purgeIsoDownloadsStep;
  resetPointerRecords: typeof import("../../delete-server/reset-pointer-records").resetPointerRecordsStep;
  storeServerDeletion: typeof import("../../delete-server/store-server-deletion").storeServerDeletionStep;
};

let steps: Steps;

const USER_ID = mockSession.user.id;
const EMAIL = mockSession.user.email;

/** A second account, to prove the erasure is scoped rather than a truncate. */
const BYSTANDER_ID = "usr_0000000000000000000000009";
const BYSTANDER_EMAIL = "bystander@example.com";

const CASE_ID = "abus_0000000000000000000000001";
const BYSTANDER_CASE_ID = "abus_0000000000000000000000002";
const SUBNET_ID = "ipsub_0000000000000000000000001";
const ALLOCATION_ID = "ipalloc_000000000000000000001";

/**
 * The footprint of somebody who actually used the product: a server with a
 * backup and reverse DNS, a custom image, credentials of every kind, an abuse
 * case with a thread and an audit trail, the raw reports behind it, and the
 * delivery log for the messages we sent about it.
 *
 * An empty account would pass a completeness test without proving anything.
 */
const seedFootprint = async (userId: string, caseId: string) => {
  await db.insert(schema.sshKeys).values({
    userId,
    name: "laptop",
    fingerprint: `SHA256:${userId}`,
    publicKey: "ssh-ed25519 AAAAC3Nz laptop",
  });
  await db.insert(schema.accounts).values({
    accountId: `discord-${userId}`,
    providerId: "discord",
    issuer: "https://discord.com",
    userId,
    accessToken: "a-live-token",
  });
  await db.insert(schema.sessions).values({
    userId,
    token: `session-${userId}`,
    expiresAt: new Date(Date.now() + 86_400_000),
    ipAddress: "203.0.113.4",
  });
  await db.insert(schema.passkeys).values({
    userId,
    publicKey: "pk",
    credentialID: `cred-${userId}`,
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    transports: "usb",
  });
  await db.insert(schema.twoFactors).values({
    userId,
    secret: "totp-secret",
    backupCodes: "codes",
    verified: true,
    failedVerificationCount: 0,
  });
  await db.insert(schema.apiKeys).values({
    referenceId: userId,
    name: "cli",
    start: "vb_",
    prefix: "vb",
    key: "vb_secret",
    enabled: true,
    rateLimitEnabled: false,
    requestCount: 0,
  });
  await db.insert(schema.accountDeletionTokens).values({
    userId,
    tokenHash: `hash-${userId}`,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await db.insert(schema.dataExports).values({
    userId,
    status: "ready",
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  await db.insert(schema.abuseCases).values({
    id: caseId,
    userId,
    category: "spam",
    severity: "high",
    title: "Outbound spam",
  } as never);
  await db.insert(schema.abuseCaseMessages).values({
    caseId,
    authorKind: "customer",
    authorUserId: userId,
    body: "It was not me.",
  } as never);
  await db.insert(schema.abuseCaseEvents).values({
    caseId,
    type: "status.changed",
    actorKind: "system",
  } as never);
  await db.insert(schema.abuseSignals).values({
    source: "abuseipdb",
    externalId: `ext-${userId}`,
    type: "abuse.spam",
    severity: "warning",
    subjectKind: "ip",
    subjectValue: "203.0.113.20",
    title: "Reported for spam",
    confidence: 80,
    attribution: "attributed",
    userId,
    caseId,
    occurredAt: new Date(),
  } as never);
  await db.insert(schema.notificationDeliveries).values({
    notificationKey: "abuse.case.opened",
    dedupeKey: `dedupe-${userId}`,
    audience: "user",
    userId,
    channel: "email",
    severity: "warning",
    params: { case: caseId },
  } as never);
};

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));

  steps = {
    anonymizeUser: (await import("../anonymize-user")).anonymizeUserStep,
    claimAccount: (await import("../claim-account")).claimAccountStep,
    eraseSubjectData: (await import("../erase-subject-data"))
      .eraseSubjectDataStep,
    unplannedErasures: (await import("../erasure-plan")).unplannedErasures,
    getServersToDestroy: (await import("../get-servers-to-destroy"))
      .getServersToDestroyStep,
    purgeAllBackups: (await import("../../delete-server/purge-all-backups"))
      .purgeAllBackupsStep,
    purgeIsoDownloads: (await import("../purge-iso-downloads"))
      .purgeIsoDownloadsStep,
    resetPointerRecords: (
      await import("../../delete-server/reset-pointer-records")
    ).resetPointerRecordsStep,
    storeServerDeletion: (
      await import("../../delete-server/store-server-deletion")
    ).storeServerDeletionStep,
  };

  await seedServerGraph(db);
  await db.insert(schema.users).values({
    id: BYSTANDER_ID,
    email: BYSTANDER_EMAIL,
    emailVerified: true,
    name: "Somebody Else",
    role: "CUSTOMER",
  });

  await seedFootprint(USER_ID, CASE_ID);
  await seedFootprint(BYSTANDER_ID, BYSTANDER_CASE_ID);

  await db
    .insert(schema.abuseCaseServers)
    .values({ caseId: CASE_ID, serverId: mockServer.id });

  // No `volid`: the archive purge is the one branch of `purgeAllBackupsStep`
  // that talks to Proxmox, and an unsettled backup has nothing on storage yet.
  await db.insert(schema.serverBackups).values({
    serverId: mockServer.id,
    name: "nightly",
    upid: "UPID:node:0000:vzdump::",
  });

  await db.insert(schema.subnets).values({
    id: SUBNET_ID,
    cidr: "203.0.113.0/24",
    gateway: "203.0.113.1",
    dnsReverseZone: "113.0.203.in-addr.arpa",
  });
  await db.insert(schema.subnetAllocations).values({
    id: ALLOCATION_ID,
    subnetId: SUBNET_ID,
    serverId: mockServer.id,
  });
  await db.insert(schema.pointerRecords).values({
    subnetAllocationId: ALLOCATION_ID,
    ip: "203.0.113.20",
    hostname: "mail.customer.example",
  });

  // `failedAt` set: a download that failed wrote no file, so the step skips
  // the node entirely and only removes the row.
  await db.insert(schema.proxmoxIsoDownloads).values({
    userId: USER_ID,
    proxmoxNodeId: mockProxmoxNode.id,
    name: "custom.iso",
    url: "https://example.invalid/custom.iso?token=secret",
    upid: "UPID:node:0000:download::",
    expiresAt: new Date(Date.now() + 86_400_000),
    failedAt: new Date(),
  } as never);

  await db.insert(schema.emails).values({
    from: "system@virtbase.com",
    to: [EMAIL],
    subject: "Your server is ready",
    html: "<p>hello</p>",
  });
});

afterAll(async () => {
  await db.$client.close();
});

/** How many rows of a table still belong to the account being erased. */
const remaining: Record<SubjectTableName, (userId: string) => Promise<number>> =
  {
    users: async () => 0,
    sessions: (id) =>
      db.$count(schema.sessions, eq(schema.sessions.userId, id)),
    accounts: (id) =>
      db.$count(schema.accounts, eq(schema.accounts.userId, id)),
    passkeys: (id) =>
      db.$count(schema.passkeys, eq(schema.passkeys.userId, id)),
    two_factors: (id) =>
      db.$count(schema.twoFactors, eq(schema.twoFactors.userId, id)),
    api_keys: (id) =>
      db.$count(schema.apiKeys, eq(schema.apiKeys.referenceId, id)),
    ssh_keys: (id) => db.$count(schema.sshKeys, eq(schema.sshKeys.userId, id)),
    servers: (id) => db.$count(schema.servers, eq(schema.servers.userId, id)),
    server_backups: async (id) =>
      db
        .select({ id: schema.serverBackups.id })
        .from(schema.serverBackups)
        .innerJoin(
          schema.servers,
          eq(schema.serverBackups.serverId, schema.servers.id),
        )
        .where(eq(schema.servers.userId, id))
        .then((rows) => rows.length),
    subnet_allocations: async () => 0,
    pointer_records: async (id) =>
      db
        .select({ id: schema.pointerRecords.id })
        .from(schema.pointerRecords)
        .innerJoin(
          schema.subnetAllocations,
          eq(
            schema.pointerRecords.subnetAllocationId,
            schema.subnetAllocations.id,
          ),
        )
        .innerJoin(
          schema.servers,
          eq(schema.subnetAllocations.serverId, schema.servers.id),
        )
        .where(eq(schema.servers.userId, id))
        .then((rows) => rows.length),
    proxmox_iso_downloads: (id) =>
      db.$count(
        schema.proxmoxIsoDownloads,
        eq(schema.proxmoxIsoDownloads.userId, id),
      ),
    orders: async () => 0,
    order_items: async () => 0,
    order_transitions: async () => 0,
    payments: async () => 0,
    payment_events: async () => 0,
    invoices: async () => 0,
    emails: async () => 0,
    data_exports: (id) =>
      db.$count(schema.dataExports, eq(schema.dataExports.userId, id)),
    account_deletion_tokens: (id) =>
      db.$count(
        schema.accountDeletionTokens,
        eq(schema.accountDeletionTokens.userId, id),
      ),
    abuse_cases: (id) =>
      db.$count(schema.abuseCases, eq(schema.abuseCases.userId, id)),
    abuse_case_servers: async (id) =>
      db
        .select({ caseId: schema.abuseCaseServers.caseId })
        .from(schema.abuseCaseServers)
        .innerJoin(
          schema.abuseCases,
          eq(schema.abuseCaseServers.caseId, schema.abuseCases.id),
        )
        .where(eq(schema.abuseCases.userId, id))
        .then((rows) => rows.length),
    abuse_case_messages: async (id) =>
      db
        .select({ id: schema.abuseCaseMessages.id })
        .from(schema.abuseCaseMessages)
        .innerJoin(
          schema.abuseCases,
          eq(schema.abuseCaseMessages.caseId, schema.abuseCases.id),
        )
        .where(eq(schema.abuseCases.userId, id))
        .then((rows) => rows.length),
    abuse_case_events: async (id) =>
      db
        .select({ id: schema.abuseCaseEvents.id })
        .from(schema.abuseCaseEvents)
        .innerJoin(
          schema.abuseCases,
          eq(schema.abuseCaseEvents.caseId, schema.abuseCases.id),
        )
        .where(eq(schema.abuseCases.userId, id))
        .then((rows) => rows.length),
    abuse_signals: (id) =>
      db.$count(schema.abuseSignals, eq(schema.abuseSignals.userId, id)),
    notification_deliveries: (id) =>
      db.$count(
        schema.notificationDeliveries,
        eq(schema.notificationDeliveries.userId, id),
      ),
    erasure_log: async () => 0,
  };

/**
 * The database half of `offboardUserWorkflow`, in the order the workflow runs
 * it.
 *
 * The Proxmox-facing steps around it - stopping and destroying the guest,
 * revoking OAuth grants, detaching the payment provider - reach services this
 * suite has no business calling and delete nothing of their own. What is left
 * is every step that writes to the database, which is exactly what a claim
 * about erasure is about.
 */
const offboard = async () => {
  const { email } = await steps.claimAccount({ userId: USER_ID });

  const servers = await steps.getServersToDestroy({ userId: USER_ID });
  for (const server of servers) {
    await steps.purgeAllBackups({
      proxmoxNode: server.proxmoxNode,
      serverId: server.id,
    });
    await steps.resetPointerRecords({ serverId: server.id });
    await steps.storeServerDeletion({ serverId: server.id });
  }

  await steps.purgeIsoDownloads({ userId: USER_ID });

  const erased = await steps.eraseSubjectData({ userId: USER_ID });

  await steps.anonymizeUser({ userId: USER_ID, email });

  return erased;
};

describe("eraseSubjectDataStep", () => {
  test("every table declared for erasure has somewhere that erases it", () => {
    // The guard that would have caught this class of bug on the day it shipped.
    // `SUBJECT_DATA` is the declaration; `ERASURE_PLAN` is the mechanism, and a
    // table in the first with no entry in the second is a table the retention
    // schedule promises to delete and nobody deletes.
    expect(steps.unplannedErasures()).toEqual([]);
  });

  test("the counters cover every table in the retention map", () => {
    // Keeps the assertion below honest: a new subject table with no counter
    // here would silently drop out of the completeness test.
    const missing = tablesToErase().filter((name) => !(name in remaining));
    expect(missing).toEqual([]);
  });

  test("offboarding leaves nothing in any table declared for erasure", async () => {
    const before = await Promise.all(
      tablesToErase().map(async (name) => [
        name,
        await remaining[name](USER_ID),
      ]),
    );

    // Every erase table starts with something in it, or the assertion after the
    // offboarding proves nothing.
    expect(
      before.filter(([, count]) => count === 0).map(([name]) => name),
    ).toEqual([]);

    const erased = await offboard();

    expect(erased.abuseCases).toBe(1);
    expect(erased.abuseCaseMessages).toBe(1);
    expect(erased.abuseCaseEvents).toBe(1);
    expect(erased.abuseSignals).toBe(1);
    expect(erased.notificationDeliveries).toBe(1);

    const after = await Promise.all(
      tablesToErase().map(async (name) => [
        name,
        await remaining[name](USER_ID),
      ]),
    );

    expect(after.filter(([, count]) => count !== 0)).toEqual([]);
  });

  test("the export has nothing left to hand over", async () => {
    // The claim `collect.ts` makes in its own docstring - that it is run "in
    // tests, to prove the erasure has nothing left to find" - finally made true.
    const data = await collectSubjectData({ db: db as never, userId: USER_ID });

    const sections = new Set(
      tablesToErase()
        .map((name) => EXPORT_SECTIONS[name as keyof typeof EXPORT_SECTIONS])
        .filter((section): section is ExportSection => Boolean(section)),
    );

    // Every erasable table really does reach a section of the export, or this
    // would be asserting over an empty set.
    expect(sections.size).toBeGreaterThan(0);

    for (const section of sections) {
      expect({
        section,
        rows: data[section as keyof typeof data],
      }).toEqual({ section, rows: [] });
    }
  });

  test("it does not reach past the account being erased", async () => {
    const survivors = await Promise.all(
      tablesToErase().map(async (name) => [
        name,
        await remaining[name](BYSTANDER_ID),
      ]),
    );

    const lost = survivors
      .filter(([, count]) => count === 0)
      .map(([name]) => name);

    // The bystander has no server, so the four tables that hang off one were
    // never populated for them.
    expect(lost).toEqual([
      "servers",
      "server_backups",
      "pointer_records",
      "proxmox_iso_downloads",
      "abuse_case_servers",
    ]);
  });
});
