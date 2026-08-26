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

import * as Sentry from "@sentry/node";
import { and, eq, lte } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { dataExports, invoices, users } from "@virtbase/db/schema";
import { integrations } from "../../integrations";
import { collectSubjectData } from "./collect";
import type { InvoiceAttachment } from "./document";
import { buildExportDocument } from "./document";

/**
 * Builds the archive for one requested export and stores it on the row.
 *
 * Deliberately one unit of work rather than a step per stage. The intermediate
 * value is the customer's entire record set plus every invoice PDF, and a
 * workflow persists what each step returns - so splitting this up would write
 * the whole dossier into the workflow log on the way past. Rebuilding from
 * scratch on retry is cheaper than storing it twice.
 *
 * Idempotent: a second run overwrites the artifact with an equivalent one.
 */
export async function buildDataExport({
  exportId,
  passphrase,
}: {
  exportId: string;
  passphrase: string;
}) {
  const row = await db
    .select({
      id: dataExports.id,
      userId: dataExports.userId,
      status: dataExports.status,
    })
    .from(dataExports)
    .where(eq(dataExports.id, exportId))
    .limit(1)
    .then(([found]) => found);

  if (!row) {
    throw new Error(`Data export ${exportId} does not exist.`);
  }

  await db
    .update(dataExports)
    .set({ status: "building" })
    .where(eq(dataExports.id, exportId));

  try {
    const data = await collectSubjectData({ db, userId: row.userId });
    const attachments = await collectInvoicePdfs(row.userId);

    const artifact = await buildExportDocument({
      data,
      invoices: attachments,
      passphrase,
    });

    const recipient = await db
      .select({
        name: users.name,
        email: users.email,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1)
      .then(([found]) => found);

    if (!recipient) {
      throw new Error(`User ${row.userId} vanished while building an export.`);
    }

    await db
      .update(dataExports)
      .set({
        status: "ready",
        // The column is `bytea`, which drizzle types as `Buffer`. `Buffer` is
        // a `Uint8Array` subclass, so this is a view rather than a copy.
        artifact: Buffer.from(
          artifact.buffer,
          artifact.byteOffset,
          artifact.byteLength,
        ),
        byteSize: artifact.byteLength,
        completedAt: new Date(),
        failureReason: null,
      })
      .where(eq(dataExports.id, exportId));

    return { byteSize: artifact.byteLength, ...recipient };
  } catch (error) {
    Sentry.captureException(error);

    await db
      .update(dataExports)
      .set({
        status: "failed",
        failureReason:
          error instanceof Error ? error.message.slice(0, 500) : "unknown",
      })
      .where(eq(dataExports.id, exportId));

    throw error;
  }
}

/**
 * Every invoice PDF the customer was ever issued.
 *
 * One call to the accounting provider per invoice, which is the reason the
 * export is built in the background rather than in a request. A provider that
 * cannot produce a particular document does not sink the whole export: the
 * failure is reported and that invoice is left out, because an export missing
 * one PDF is worth more to the customer than no export at all. Its metadata is
 * still in `export.json` either way.
 */
async function collectInvoicePdfs(
  userId: string,
): Promise<InvoiceAttachment[]> {
  const issued = await db
    .select({
      number: invoices.number,
      externalId: invoices.lexwareInvoiceId,
    })
    .from(invoices)
    .where(and(eq(invoices.userId, userId)));

  if (issued.length === 0) return [];

  const provider = await integrations.resolve("invoice");
  if (!provider) {
    Sentry.captureMessage(
      "No invoice provider is configured; export will carry no invoice PDFs.",
      "warning",
    );
    return [];
  }

  const attachments: InvoiceAttachment[] = [];

  // Sequential on purpose. Firing every invoice at the provider at once is the
  // quickest way to get rate limited by it, and nobody is watching this run.
  for (const invoice of issued) {
    try {
      const pdf = await provider.downloadInvoice(invoice.externalId);
      attachments.push({ number: invoice.number, pdf: new Uint8Array(pdf) });
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  return attachments;
}

/**
 * Deletes every export whose retention window has closed, artifact and all.
 *
 * The bytes are the point: a `data_exports` row is a complete dossier on a
 * person, so letting one linger past its expiry quietly undoes the reason the
 * table has an expiry at all.
 */
export async function purgeExpiredExports(now = new Date()): Promise<number> {
  const purged = await db
    .delete(dataExports)
    .where(lte(dataExports.expiresAt, now))
    .returning({ id: dataExports.id });

  return purged.length;
}
