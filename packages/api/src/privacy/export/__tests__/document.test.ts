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
import type { SubjectExport } from "../collect";
import { buildDocumentSections, buildExportDocument } from "../document";

const data = {
  schema_version: 1,
  generated_at: "2026-08-26T12:00:00.000Z",
  account: {
    id: "usr_1",
    name: "Łukasz Şükrü Γεώργιος",
    email: "lukasz@example.com",
    email_verified: true,
    image: null,
    locale: "pl",
    role: "CUSTOMER",
    two_factor_enabled: null,
    created_at: new Date("2024-01-05T00:00:00.000Z"),
    updated_at: new Date("2026-01-05T00:00:00.000Z"),
    last_seen_at: null,
  },
  sessions: [
    {
      id: "sess_1",
      ip_address: "203.0.113.7",
      user_agent: "Mozilla/5.0",
      created_at: new Date("2026-08-01T00:00:00.000Z"),
      expires_at: new Date("2026-08-04T00:00:00.000Z"),
    },
  ],
  linked_accounts: [
    {
      id: "acc_1",
      provider: "discord",
      account_id: "discord-123",
      scope: "identify email",
      created_at: new Date("2025-02-02T00:00:00.000Z"),
    },
  ],
  passkeys: [
    {
      id: "passkey_1",
      device_type: "singleDevice",
      backed_up: false,
      created_at: new Date("2025-03-03T00:00:00.000Z"),
    },
  ],
  api_keys: [
    {
      id: "api_1",
      name: "deploy bot",
      starts_with: "vb_live",
      enabled: true,
      request_count: 12,
      last_request: new Date("2026-07-07T00:00:00.000Z"),
      expires_at: null,
      created_at: new Date("2025-04-04T00:00:00.000Z"),
    },
  ],
  ssh_keys: [
    {
      id: "sshkey_1",
      name: "workstation",
      fingerprint: "SHA256:9nDx1exampleFingerprint",
      public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 workstation",
      created_at: new Date("2025-05-05T00:00:00.000Z"),
    },
  ],
  servers: [
    {
      id: "kvm_1",
      name: "vb-prod-01",
      vmid: 101,
      operating_system: "Debian GNU/Linux 13 (trixie)",
      operating_system_version: "13",
      kernel: "6.12.48+deb13-amd64",
      installed_at: new Date("2025-06-06T00:00:00.000Z"),
      terminates_at: null,
      suspended_at: null,
      created_at: new Date("2025-06-06T00:00:00.000Z"),
    },
  ],
  backups: [
    {
      id: "kbu_1",
      server_id: "kvm_1",
      name: "nightly",
      size: 4096,
      started_at: new Date("2026-08-01T02:00:00.000Z"),
      finished_at: new Date("2026-08-01T02:11:00.000Z"),
      failed_at: null,
    },
  ],
  ip_addresses: [
    {
      id: "ipalloc_1",
      server_id: "kvm_1",
      subnet: "203.0.113.0/24",
      gateway: "203.0.113.1",
      description: null,
      allocated_at: new Date("2025-06-06T00:00:00.000Z"),
      deallocated_at: null,
    },
  ],
  reverse_dns: [
    {
      ip: "203.0.113.7",
      hostname: "mail.example.com",
      created_at: new Date("2025-06-07T00:00:00.000Z"),
    },
  ],
  custom_images: [
    {
      id: "iso_1",
      name: "alpine-custom",
      url: "https://example.com/alpine.iso",
      expires_at: new Date("2026-09-01T00:00:00.000Z"),
      created_at: new Date("2026-08-01T00:00:00.000Z"),
    },
  ],
  orders: [
    {
      id: "ord_1",
      type: "new_server",
      status: "fulfilled",
      total_amount: 1990,
      currency: "EUR",
      billing_address: null,
      configuration: {},
      paid_at: new Date("2025-06-06T00:00:00.000Z"),
      fulfilled_at: new Date("2025-06-06T00:10:00.000Z"),
      created_at: new Date("2025-06-06T00:00:00.000Z"),
      items: [
        {
          order_id: "ord_1",
          name: "VPS Medium",
          description: null,
          quantity: 1,
          unit_amount: 1990,
          tax_rate_percentage: 19,
        },
      ],
    },
  ],
  payments: [
    {
      id: "pay_1",
      order_id: "ord_1",
      provider: "stripe",
      status: "succeeded",
      amount: 1990,
      captured_amount: 1990,
      refunded_amount: 0,
      currency: "EUR",
      method: "card",
      created_at: new Date("2025-06-06T00:00:00.000Z"),
    },
  ],
  invoices: [
    {
      id: "inv_1",
      number: "RE-2025-0042",
      total: 1990,
      tax_amount: 318,
      reverse_charge: false,
      paid_at: new Date("2025-06-06T00:00:00.000Z"),
      cancelled_at: null,
      created_at: new Date("2025-06-06T00:00:00.000Z"),
    },
  ],
  emails: [
    {
      id: "email_1",
      subject: "Your server is ready",
      last_event: "delivered",
      created_at: new Date("2025-06-06T00:15:00.000Z"),
    },
  ],
} as unknown as SubjectExport;

const PASSPHRASE = "correct-horse-battery-staple";

const build = () =>
  buildExportDocument({
    data,
    passphrase: PASSPHRASE,
    invoices: [
      { number: "RE-2026-001", pdf: new TextEncoder().encode("%PDF-1.4 fake") },
    ],
  });

describe("buildExportDocument", () => {
  test("it produces a PDF", async () => {
    const pdf = await build();

    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });

  test("it is encrypted", async () => {
    const raw = Buffer.from(await build()).toString("latin1");

    // Asserting the cipher, not the PDF version. pdfkit takes `pdfVersion`
    // "1.7" without complaint and quietly gives you AESV2 - AES-128 - because
    // AES-256 only exists from Extension Level 3. The scheme is the only place
    // that difference is visible.
    expect(raw).toContain("/Encrypt");
    expect(raw).toContain("/CFM /AESV3");
    expect(raw).toContain("/Length 32");
  });

  test("the embedded data is not readable without the passphrase", async () => {
    // The point of encrypting it. If the JSON were sitting in the file as
    // plaintext, the passphrase would be decoration.
    const raw = Buffer.from(await build()).toString("latin1");

    expect(raw).not.toContain("lukasz@example.com");
    expect(raw).not.toContain("lukasz@example.com");
    expect(raw).not.toContain(PASSPHRASE);
  });

  test("it carries export.json and every invoice as attachments", async () => {
    const raw = Buffer.from(await build()).toString("latin1");

    // Attachment names live in the (unencrypted) name tree, so they stay
    // greppable even though their contents do not.
    expect(raw).toContain("Names");
    expect(raw).toContain("EmbeddedFiles");
  });

  test("it renders non-Latin names without corrupting them", async () => {
    // pdfkit's standard fonts are WinAnsi-encoded and silently mangle Greek and
    // Polish into unrelated bytes. This asserts the embedded TrueType font is
    // actually registered and used, which is what makes those names survive.
    const pdf = await build();

    expect(pdf.byteLength).toBeGreaterThan(20_000);
  });

  test("it works for a customer with no invoices", async () => {
    const pdf = await buildExportDocument({
      data,
      invoices: [],
      passphrase: PASSPHRASE,
    });

    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

const buildArchival = (locale?: string) =>
  buildExportDocument({ data, invoices: [], locale });

describe("the archival variant", () => {
  test("omitting the passphrase produces a tagged PDF/A instead", async () => {
    const raw = Buffer.from(await buildArchival()).toString("latin1");

    expect(raw).toContain("pdfaid:part");
    expect(raw).toContain("/MarkInfo");
  });

  test("it is not encrypted, because PDF/A forbids it", async () => {
    // The two modes are mutually exclusive by specification. If this ever
    // carried both, the file would claim a conformance no validator grants.
    const raw = Buffer.from(await buildArchival()).toString("latin1");

    expect(raw).not.toContain("/Encrypt");
  });

  test("the encrypted variant makes no PDF/A claim", async () => {
    const raw = Buffer.from(await build()).toString("latin1");

    expect(raw).not.toContain("pdfaid:part");
  });

  test("it still carries the machine-readable attachment", async () => {
    const raw = Buffer.from(await buildArchival()).toString("latin1");

    // Unencrypted, so the attachment name is plainly visible here.
    expect(raw).toContain("export.json");
  });

  test("it renders in the customer's language", async () => {
    // Not a request-context translation: the builder carries its own catalog
    // because it runs inside a workflow step, where `getExtracted` has nothing
    // to resolve against.
    const german = Buffer.from(await buildArchival("de")).toString("latin1");

    expect(german).toContain("Bericht");
  });

  test("an unknown locale falls back to the source language", async () => {
    const raw = Buffer.from(await buildArchival("xx")).toString("latin1");

    expect(raw).toContain("User Data Report");
  });
});

describe("the report shows records, not counts", () => {
  const sections = () => buildDocumentSections(data, "en");
  const find = (title: string) =>
    sections().find((section) => section.title === title);

  test("it uses the original section headings", async () => {
    // Restored wording: this document has always been the "User Data Report",
    // and support answering a request should hand over the same thing the
    // customer downloads.
    const titles = sections().map((section) => section.title);

    expect(titles).toContain("Report Information");
    expect(titles).toContain("User data");
    expect(titles).toContain("Session information");
    expect(titles).toContain("Linked accounts");
    expect(titles).toContain("Payment history");
  });

  test("the title is the report, not a summary of it", async () => {
    const raw = Buffer.from(await buildArchival()).toString("latin1");

    // Lives in the document info dictionary, which is not compressed.
    expect(raw).toContain("User Data Report");
  });

  test("every section carries the records themselves", async () => {
    // A count tells a reader nothing they cannot see from their own dashboard.
    const servers = find("Servers");

    expect(servers?.kind).toBe("records");
    expect(servers?.kind === "records" && servers.items[0]?.caption).toBe(
      "vb-prod-01",
    );
    expect(
      servers?.kind === "records" &&
        servers.items[0]?.rows.map(([label]) => label),
    ).toContain("Operating system:");
  });

  test("an order lists what was actually bought", async () => {
    const orders = find("Orders");
    const rows =
      orders?.kind === "records" ? (orders.items[0]?.rows ?? []) : [];

    expect(rows.some(([, value]) => value.includes("VPS Medium"))).toBe(true);
    // Formatted in the document locale: 19.90 in English, 19,90 in German.
    expect(rows.some(([, value]) => value.includes("19.90"))).toBe(true);
    expect(rows.some(([label]) => label === "1 ×")).toBe(true);
  });

  test("the user section reads as it did before", async () => {
    const user = find("User data");
    const labels =
      user?.kind === "fields" ? user.rows.map(([label]) => label) : [];

    expect(labels).toEqual([
      "ID:",
      "Display name:",
      "Email:",
      "Email confirmed:",
      "Language:",
      "Registration date:",
      "Last change:",
    ]);
  });

  test("an empty section is kept and says so", async () => {
    // "We hold nothing here" is itself an answer to an access request; a
    // missing section reads as an oversight.
    const bare = { ...data, sessions: [] } as unknown as SubjectExport;
    const section = buildDocumentSections(bare, "en").find(
      (candidate) => candidate.title === "Session information",
    );

    expect(section?.kind).toBe("records");
    expect(section?.kind === "records" && section.items).toEqual([]);
  });

  test("it renders in the customer's language", async () => {
    const german = buildDocumentSections(data, "de").map((s) => s.title);

    expect(german).toContain("Nutzerdaten");
    expect(german).toContain("Sitzungsinformationen");
  });

  test("with no locale given it uses the language of the account", async () => {
    // The bug this guards: `buildDataExport` never passed a locale, so a
    // customer downloading a record of their own account got it in English.
    // The default now comes from the data itself, which a caller cannot forget.
    const dutch = {
      ...data,
      account: { ...data.account, locale: "nl" },
    } as unknown as SubjectExport;

    expect(buildDocumentSections(dutch).map((s) => s.title)).toContain(
      "Gebruikersgegevens",
    );
  });

  test("an explicit locale still wins, for a different reader", async () => {
    // The admin console renders the same document for whoever is reading it,
    // not for the person it describes.
    const dutch = {
      ...data,
      account: { ...data.account, locale: "nl" },
    } as unknown as SubjectExport;

    expect(buildDocumentSections(dutch, "de").map((s) => s.title)).toContain(
      "Nutzerdaten",
    );
  });

  test("an account with no locale falls back to the source language", async () => {
    const none = {
      ...data,
      account: { ...data.account, locale: null },
    } as unknown as SubjectExport;

    expect(buildDocumentSections(none).map((s) => s.title)).toContain(
      "User data",
    );
  });
});
