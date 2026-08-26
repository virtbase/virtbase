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

import { sql } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { accountDeletionReasonEnum, users } from "./auth";

/**
 * A single-use token proving control of the mailbox behind an account.
 *
 * Separate from Better Auth's `verifications` on purpose. Its
 * `/delete-user/callback` requires a live session to consume a token, so a
 * confirmation link only works in a browser that is still signed in - which is
 * the wrong shape for a link sent by email and opened wherever the customer
 * happens to read their mail. Here the token *is* the proof, so no session is
 * needed, and the consumed row stays as evidence of when it was used.
 */
export const accountDeletionTokens = d.snakeCase.table(
  "account_deletion_tokens",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "adt_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /**
     * SHA-256 of the token that was emailed, hex encoded.
     *
     * [!] Never the token itself. Anyone who can read this table would
     * otherwise be able to confirm a deletion on someone else's behalf.
     */
    tokenHash: d.text().notNull().unique(),
    expiresAt: d.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    /**
     * When the token was spent. A second click is refused rather than silently
     * re-confirming.
     *
     * @default null
     */
    consumedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [d.index().on(t.userId), d.index().on(t.expiresAt)],
);

export const dataExportStatusEnum = d.pgEnum("data_export_statuses", [
  "pending",
  "building",
  "ready",
  "failed",
  "expired",
]);

/**
 * A customer's own copy of everything we hold about them.
 *
 * Built asynchronously because it fetches every invoice PDF from the
 * accounting provider one call at a time - work that belongs in a workflow
 * with retries, not in a request.
 */
export const dataExports = d.snakeCase.table(
  "data_exports",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "exp_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    status: dataExportStatusEnum().notNull().default("pending"),
    /**
     * The finished archive, encrypted with a passphrase the customer is shown
     * once in the browser and which is never emailed alongside the link.
     *
     * [!] Multi-megabyte. Postgres keeps it out of line in TOAST storage, so
     * the row stays cheap to read - as long as queries name their columns and
     * never `select *` off this table.
     *
     * @default null
     */
    artifact: d.bytea(),
    /** Size of {@link artifact} in bytes, so the UI can say so before downloading. */
    byteSize: d.integer(),
    /**
     * Why the build failed, when it did.
     *
     * @default null
     */
    failureReason: d.text(),
    /**
     * When the customer first downloaded it. Kept for the audit trail, not to
     * restrict further downloads before expiry.
     *
     * @default null
     */
    downloadedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When the archive is destroyed. An export is a complete dossier on a
     * person, so it is deliberately short-lived rather than kept around.
     */
    expiresAt: d.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    completedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    d.index().on(t.userId),
    d.index().on(t.status),
    d.index().on(t.expiresAt),
  ],
);

/**
 * Append-only proof that an erasure happened and what it left behind.
 *
 * [!] `userId` is deliberately *not* a foreign key. Once the retention window
 * on the last invoice closes, the tombstoned `users` row is purged too - and a
 * cascade would take this record with it, destroying the only evidence that
 * the erasure was ever carried out. The whole point is that it outlives its
 * subject.
 *
 * Contains no personal data by construction: an id, a reason, timestamps and
 * counts. It is what demonstrates compliance under Article 5(2) without
 * becoming another thing to erase.
 */
export const erasureLog = d.snakeCase.table(
  "erasure_log",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "erl_" })),
    /** The account that was erased. Not a reference - see the note above. */
    userId: d.text().notNull(),
    reason: accountDeletionReasonEnum().notNull(),
    /** What was destroyed, by category, e.g. `{ servers: 2, sshKeys: 5 }`. */
    destroyed: d.jsonb().notNull(),
    /**
     * What was kept and under which legal basis, e.g.
     * `{ invoices: { count: 7, basis: "statutory-retention", untilYear: 2036 } }`.
     */
    retained: d.jsonb().notNull(),
    startedAt: d.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    completedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [d.index().on(t.userId), d.index().on(t.completedAt)],
);

export type AccountDeletionToken = typeof accountDeletionTokens.$inferSelect;
export type DataExport = typeof dataExports.$inferSelect;
export type DataExportStatus = DataExport["status"];
export type ErasureLogEntry = typeof erasureLog.$inferSelect;
