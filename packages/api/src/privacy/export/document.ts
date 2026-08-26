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

import { APP_NAME } from "@virtbase/utils";
import PDFDocument from "pdfkit";
import { createFormatter } from "use-intl/core";
import {
  COLOR_SECONDARY,
  renderBackgroundImage,
  renderDivider,
  renderWordmark,
  WORDMARK_ALT,
} from "./brand";
import type { SubjectExport } from "./collect";
import type { DocumentMessages } from "./messages";
import { getDocumentMessages, resolveDocumentLocale } from "./messages";

/**
 * The fonts, decompressed from a generated module rather than read off disk.
 *
 * [!] Do not go back to the filesystem here. This document is rendered from a
 * workflow step, an admin server action and the test suite, and each bundles
 * this package differently. `process.cwd()` only resolves when the process
 * started in the app root; `new URL(..., import.meta.url)` resolves to a chunk
 * path where the `.ttf` is not, and hands `node:fs` a `URL` from a different
 * realm than its own `instanceof` check - which fails with the memorable
 * "must be an instance of URL. Received an instance of URL".
 *
 * Imported lazily so a quarter of a megabyte of font is only paid for by the
 * requests that actually render a document.
 */
async function loadFonts() {
  const [{ ARIAL_BLACK_GZIP_BASE64, ARIAL_GZIP_BASE64 }, { gunzipSync }] =
    await Promise.all([import("./fonts.generated"), import("node:zlib")]);

  return {
    body: gunzipSync(Buffer.from(ARIAL_GZIP_BASE64, "base64")),
    headline: gunzipSync(Buffer.from(ARIAL_BLACK_GZIP_BASE64, "base64")),
  };
}

export interface InvoiceAttachment {
  /** Invoice number, used as the attachment's filename. */
  number: string;
  pdf: Uint8Array;
}

export interface BuildExportDocumentInput {
  data: SubjectExport;
  invoices: InvoiceAttachment[];
  /**
   * Opens the document, and decides what kind of document it is.
   *
   * Given: an encrypted PDF, for handing to a customer over the wire.
   * Omitted: a tagged PDF/A-3a, for an archive or an admin answering a request
   * on someone's behalf.
   *
   * [!] The two are mutually exclusive by specification, not by preference.
   * PDF/A forbids encryption outright (ISO 19005-1 §6.1.3 and every part
   * since), so a "password-protected PDF/A" cannot exist - pdfkit will happily
   * emit one and no validator will accept it. This parameter is that tradeoff,
   * made explicit and made once.
   */
  passphrase?: string;
  /**
   * BCP 47 tag. Falls back to English for anything outside the catalog.
   *
   * Defaults to the locale of the person the document is *about*, read from
   * the data itself - so a caller cannot accidentally hand a German customer
   * an English record of their own account by forgetting to pass it. Override
   * it only when someone else is the reader, as the admin console does.
   */
  locale?: string | null;
}

/**
 * A customer's data export, as one PDF.
 *
 * Carries both obligations in a single file: readable pages answer the access
 * right, and `export.json` - embedded as a PDF file attachment, the way a
 * ZUGFeRD invoice carries its XML - answers the portability one. The invoice
 * PDFs ride along as further attachments.
 *
 * This is also what the admin console hands out when a request arrives by post
 * or email, which is why it is one builder rather than two: a customer and a
 * regulator asking the same question should not get different documents.
 */
export async function buildExportDocument({
  data,
  invoices,
  passphrase,
  locale,
}: BuildExportDocumentInput): Promise<Uint8Array> {
  const { body, headline } = await loadFonts();

  const resolvedLocale = resolveDocumentLocale(locale ?? data.account.locale);
  const t = getDocumentMessages(resolvedLocale);
  const encrypted = Boolean(passphrase);

  const document = new PDFDocument({
    size: "A4",
    margins: {
      top: "1.38cm",
      bottom: "0.88cm",
      left: "1.5cm",
      right: "1.5cm",
    },
    lang: resolvedLocale,
    displayTitle: true,
    // Tagging and the PDF/A claim only apply to the unencrypted variant.
    // Asserting PDF/A on an encrypted file would be a claim no validator
    // agrees with.
    tagged: !encrypted,
    ...(encrypted
      ? {
          // [!] "1.7ext3", not "1.7". AES-256 (AESV3/R6) lives in PDF 1.7
          // Extension Level 3; plain "1.7" silently gets you AESV2, which is
          // AES-128. The difference surfaces nowhere except the encryption
          // dictionary.
          pdfVersion: "1.7ext3" as const,
          userPassword: passphrase,
          ownerPassword: passphrase,
          permissions: {
            printing: "highResolution" as const,
            copying: true,
          },
        }
      : { pdfVersion: "1.7" as const, subset: "PDF/A-3a" as const }),
  });

  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve) =>
    document.on("end", () => resolve()),
  );

  document.info.Title = t.title;
  document.info.Author = APP_NAME;
  document.info.CreationDate = new Date(data.generated_at);

  renderBackgroundImage(document);
  document.on("pageAdded", () => renderBackgroundImage(document));

  document.registerFont("body", body);
  document.registerFont("headline", headline);
  // Also the document's default. Left unset, pdfkit starts on Helvetica - a
  // standard font it does not embed, which a PDF/A validator rejects and which
  // silently mangles anything outside WinAnsi.
  document.font("body");

  const root = document.struct("Document");
  document.addStructure(root);

  renderHeader(document, root, t);
  renderSections(document, root, t, data, resolvedLocale);

  // The machine-readable half. Named so it is obvious in a reader's attachment
  // pane which file is the data and which are the invoices.
  document.file(Buffer.from(JSON.stringify(data, null, 2), "utf8"), {
    name: "export.json",
    type: "application/json",
    description: "Every record Virtbase holds about you, machine-readable.",
  });

  for (const invoice of invoices) {
    document.file(Buffer.from(invoice.pdf), {
      name: `invoices/${invoice.number}.pdf`,
      type: "application/pdf",
      description: `Invoice ${invoice.number}`,
    });
  }

  document.end();
  await finished;

  return new Uint8Array(Buffer.concat(chunks));
}

type Struct = ReturnType<PDFKit.PDFDocument["struct"]>;
type Row = [label: string, value: string];

/** One record in a repeating section: a spanning caption over its own fields. */
interface Record_ {
  caption: string;
  rows: Row[];
}

const DASH = "—";

function renderHeader(
  document: PDFKit.PDFDocument,
  root: Struct,
  t: DocumentMessages,
) {
  root.add(
    document.struct("H1", {}, () => {
      document.fontSize(19.5).font("headline").text(t.title);
    }),
  );

  root.add(
    document.struct("Figure", { alt: WORDMARK_ALT }, () =>
      renderWordmark(document),
    ),
  );

  root.add(document.struct("Div", {}, () => renderDivider(document)));
}

/** A section of the report: either one table of fields, or a table per record. */
export type DocumentSection =
  | { title: string; kind: "fields"; rows: Row[] }
  | { title: string; kind: "records"; items: Record_[] };

/**
 * Every section of the document, in the order a customer would look for them:
 * what this file is, who they are, then what they actually had with us.
 *
 * The counts that used to stand in for this told a reader nothing they could
 * not see from their own dashboard. An access request is answered with the
 * records themselves.
 *
 * Pure, and separate from the drawing on purpose: once a font is subsetted the
 * content stream holds glyph indices rather than text, so what the document
 * says can only be asserted here.
 */
export function buildDocumentSections(
  data: SubjectExport,
  locale?: string | null,
): DocumentSection[] {
  // Same default as `buildExportDocument`: the language of the person the
  // document is about, unless the caller names another reader.
  const resolved = resolveDocumentLocale(locale ?? data.account.locale);
  const t = getDocumentMessages(resolved);
  // Pinned, not inherited. A records document has to say when something
  // happened without the reader guessing whose clock it was rendered on - and
  // left unset, `use-intl` falls back to whatever timezone the server process
  // happens to be in, which for a serverless function is nobody's. `timeStyle`
  // names the zone, so the output says UTC out loud.
  const f = createFormatter({ locale: resolved, timeZone: "UTC" });

  const sections: DocumentSection[] = [];
  const fields = (title: string, rows: Row[]) =>
    sections.push({ title, kind: "fields", rows });
  const records = (title: string, items: Record_[]) =>
    sections.push({ title, kind: "records", items });
  const date = (value: Date | string | null | undefined) =>
    value
      ? f.dateTime(new Date(value), { dateStyle: "long", timeStyle: "short" })
      : DASH;

  const money = (cents: number, currency = "EUR") =>
    f.number(cents / 100, { style: "currency", currency });

  fields(t.reportInformation, [
    [t.exportTimestamp, date(data.generated_at)],
    [t.formatVersion, `${data.schema_version}`],
  ]);

  fields(t.userData, [
    [t.id, data.account.id],
    [t.displayName, data.account.name],
    [t.emailLabel, data.account.email],
    [t.emailConfirmed, data.account.email_verified ? t.yes : t.no],
    [t.language, data.account.locale ?? t.notSet],
    [t.registrationDate, date(data.account.created_at)],
    [t.lastChange, date(data.account.updated_at)],
  ]);

  records(
    t.servers,
    data.servers.map((server) => ({
      caption: server.name,
      rows: [
        [t.id, server.id],
        [t.operatingSystem, server.operating_system ?? DASH],
        [t.installedAt, date(server.installed_at)],
        [t.expiresAt, date(server.terminates_at)],
        [t.creationDate, date(server.created_at)],
      ],
    })),
  );

  records(
    t.backups,
    data.backups.map((backup) => ({
      caption: backup.name,
      rows: [
        [t.id, backup.id],
        [t.size, backup.size ? `${backup.size}` : DASH],
        [t.startedAt, date(backup.started_at)],
        [t.finishedAt, date(backup.finished_at)],
      ],
    })),
  );

  records(
    t.ipAddresses,
    data.ip_addresses.map((allocation) => ({
      caption: `${allocation.subnet}`,
      rows: [
        [t.id, allocation.id],
        [t.gateway, `${allocation.gateway}`],
        [t.creationDate, date(allocation.allocated_at)],
      ],
    })),
  );

  records(
    t.reverseDns,
    data.reverse_dns.map((record) => ({
      caption: `${record.ip}`,
      rows: [
        [t.hostname, record.hostname],
        [t.creationDate, date(record.created_at)],
      ],
    })),
  );

  records(
    t.customImages,
    data.custom_images.map((image) => ({
      caption: image.name,
      rows: [
        [t.id, image.id],
        [t.url, image.url],
        [t.expiresAt, date(image.expires_at)],
        [t.creationDate, date(image.created_at)],
      ],
    })),
  );

  records(
    t.sshKeys,
    data.ssh_keys.map((key) => ({
      caption: key.name,
      rows: [
        [t.fingerprint, key.fingerprint],
        [t.publicKey, key.public_key],
        [t.creationDate, date(key.created_at)],
      ],
    })),
  );

  records(
    t.orders,
    data.orders.map((order) => ({
      caption: date(order.created_at),
      rows: [
        [t.id, order.id],
        [t.type, order.type],
        [t.status, order.status],
        [t.total, money(order.total_amount, order.currency)],
        ...order.items.map(
          (item): Row => [
            `${item.quantity} \u00d7`,
            `${item.name} — ${money(item.unit_amount, order.currency)}`,
          ],
        ),
      ],
    })),
  );

  records(
    t.invoices,
    data.invoices.map((invoice) => ({
      caption: invoice.number,
      rows: [
        [t.id, invoice.id],
        [t.total, money(invoice.total)],
        [t.tax, money(invoice.tax_amount)],
        [t.paidAt, date(invoice.paid_at)],
        [t.creationDate, date(invoice.created_at)],
      ],
    })),
  );

  records(
    t.paymentHistory,
    data.payments.map((payment) => ({
      caption: date(payment.created_at),
      rows: [
        [t.id, payment.id],
        [t.amount, money(payment.amount, payment.currency)],
        [t.status, payment.status],
        [t.method, payment.method ?? DASH],
        [t.providerId, payment.provider],
      ],
    })),
  );

  records(
    t.sessionInformation,
    data.sessions.map((session) => ({
      caption: date(session.created_at),
      rows: [
        [t.id, session.id],
        [t.ipAddressLabel, session.ip_address ?? DASH],
        [t.userAgent, session.user_agent ?? DASH],
        [t.expiresAt, date(session.expires_at)],
      ],
    })),
  );

  records(
    t.linkedAccounts,
    data.linked_accounts.map((account) => ({
      caption: account.provider,
      rows: [
        [t.id, account.id],
        [t.providerId, account.account_id],
        [t.permissions, account.scope ?? DASH],
        [t.creationDate, date(account.created_at)],
      ],
    })),
  );

  records(
    t.passkeys,
    data.passkeys.map((passkey) => ({
      caption: passkey.device_type,
      rows: [
        [t.id, passkey.id],
        [t.creationDate, date(passkey.created_at)],
      ],
    })),
  );

  records(
    t.apiKeys,
    data.api_keys.map((key) => ({
      caption: key.name ?? DASH,
      rows: [
        [t.id, key.id],
        [t.prefix, key.starts_with ?? DASH],
        [t.lastRequest, date(key.last_request)],
        [t.expiresAt, date(key.expires_at)],
        [t.creationDate, date(key.created_at)],
      ],
    })),
  );

  records(
    t.emails,
    data.emails.map((mail) => ({
      caption: mail.subject,
      rows: [
        [t.status, mail.last_event ?? DASH],
        [t.sentAt, date(mail.created_at)],
      ],
    })),
  );

  return sections;
}

/** Draws what {@link buildDocumentSections} decided. */
function renderSections(
  document: PDFKit.PDFDocument,
  root: Struct,
  t: DocumentMessages,
  data: SubjectExport,
  locale?: string | null,
) {
  const sections = buildDocumentSections(data, locale);

  for (const [index, section] of sections.entries()) {
    const element = heading(document, root, section.title);

    if (section.kind === "fields") {
      element.add(
        document.struct("Table", {}, () => table(document, section.rows)),
      );

      // The note about the attachments belongs right after the report header,
      // where a reader is still working out what this file is.
      if (index === 0) {
        root.add(
          document.struct("P", {}, () => {
            document
              .moveDown()
              .fontSize(9.5)
              .font("body")
              .fillColor("#000")
              .text(t.attachments, document.page.margins.left);
          }),
        );
      }

      continue;
    }

    if (section.items.length === 0) {
      element.add(
        document.struct("P", {}, () => {
          document
            .fontSize(9.5)
            .font("body")
            .fillColor("#000")
            .text(t.empty, document.page.margins.left);
        }),
      );

      continue;
    }

    for (const item of section.items) {
      element.add(
        document.struct("Table", {}, () =>
          table(document, item.rows, item.caption),
        ),
      );
    }
  }
}

function heading(document: PDFKit.PDFDocument, root: Struct, title: string) {
  const section = document.struct("Sect");
  root.add(section);

  section.add(
    document.struct("H2", {}, () => {
      document
        .moveDown()
        .fontSize(14.5)
        .font("headline")
        .fillColor("#000")
        .text(title, document.page.margins.left)
        .moveDown();
    }),
  );

  return section;
}

function table(document: PDFKit.PDFDocument, rows: Row[], caption?: string) {
  document
    .fontSize(9.5)
    .font("body")
    .table({
      columnStyles: [
        { width: 130, minWidth: 90 },
        { width: "*", minWidth: 120 },
      ],
      defaultStyle: {
        padding: 8,
        border: 0,
        textColor: "#000",
      },
      data: [
        ...(caption
          ? [
              [
                {
                  text: caption,
                  type: "TH" as const,
                  colSpan: 2,
                  backgroundColor: COLOR_SECONDARY,
                },
              ],
            ]
          : []),
        ...rows.map(([label, value]) => [
          { text: label, type: "TH" as const },
          { text: value, type: "TD" as const },
        ]),
      ],
    });
}
