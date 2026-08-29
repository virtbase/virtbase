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

import { INVOICE_RETENTION_YEARS } from "@virtbase/utils";

/**
 * What happens to a table's rows when the person they belong to is erased.
 *
 * - `erase` — the rows are deleted outright.
 * - `anonymise` — the row survives because something else needs it, with every
 *   personal field scrubbed.
 * - `retain` — kept whole, under a legal obligation that outranks erasure.
 */
export type Disposition = "erase" | "anonymise" | "retain";

/**
 * How the rows belonging to one person are found.
 *
 * Spelled out per table because the joins genuinely differ, and because
 * "delete everything with this user id" is wrong for more than half of them.
 */
export type Ownership =
  /** The table itself carries `user_id`. */
  | { via: "user_id" }
  /** Better Auth's api-key plugin names the column `reference_id`. */
  | { via: "reference_id" }
  /** Reached through `servers`, which is the thing that carries `user_id`. */
  | { via: "server" }
  /** Reached through `orders`. */
  | { via: "order" }
  /** Reached through `abuse_cases`, which is the thing that carries `user_id`. */
  | { via: "abuse_case" }
  /** Reached through `subnet_allocations`, itself reached through `servers`. */
  | { via: "subnet_allocation" }
  /** Keyed by email address rather than by id. */
  | { via: "email" }
  /** The subject's own row. */
  | { via: "self" };

export interface SubjectTable {
  ownership: Ownership;
  disposition: Disposition;
  /** Why this disposition, in one line. Feeds the published retention schedule. */
  reason: string;
  /** What justifies keeping it. Required for `retain`, absent otherwise. */
  basis?: string;
  /** Whether the table's contents belong in a customer's data export. */
  exportable: boolean;
}

/**
 * Every table holding something that belongs to a customer.
 *
 * The single enumeration behind both the export and the erasure, so the two
 * cannot disagree about what a person's data is: anything missing from here is
 * missing from the export *and* survives the deletion, and that pair of bugs
 * is much easier to catch as one.
 *
 * Tables absent from this map hold no subject data - plans, nodes, templates,
 * datacenters, settings. `subject-data.test.ts` proves the absence is
 * deliberate by walking the schema for `user_id` columns and failing on any
 * that are not named here.
 */
export const SUBJECT_DATA = {
  users: {
    ownership: { via: "self" },
    disposition: "anonymise",
    reason:
      "Scrubbed to a tombstone so the retained financial rows keep a valid foreign key. No longer personal data afterwards.",
    exportable: true,
  },
  sessions: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "IP addresses and user agents, with no reason to outlive the account.",
    exportable: true,
  },
  accounts: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "Password hashes and OAuth tokens. Revoked at the provider before the rows go, or the grant outlives us.",
    exportable: true,
  },
  passkeys: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason: "Credential material.",
    exportable: true,
  },
  two_factors: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason: "Shared secrets and backup codes.",
    exportable: false,
  },
  api_keys: {
    ownership: { via: "reference_id" },
    disposition: "erase",
    reason:
      "Credential material. Revoked before anything else, so nothing can act mid-erasure.",
    exportable: true,
  },
  ssh_keys: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "A public key identifies a person and grants access to their machines. Personal data on both counts.",
    exportable: true,
  },
  servers: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "Only once the guest is destroyed in Proxmox. Deleting the row first leaves a running VM nobody owns.",
    exportable: true,
  },
  server_backups: {
    ownership: { via: "server" },
    disposition: "erase",
    reason: "Archives purged from the node first, then the rows.",
    exportable: true,
  },
  subnet_allocations: {
    ownership: { via: "server" },
    disposition: "anonymise",
    reason:
      "Deallocated and the description cleared. Which address was assigned when has an abuse-handling basis; the customer's note on it does not.",
    exportable: true,
  },
  pointer_records: {
    ownership: { via: "subnet_allocation" },
    disposition: "erase",
    reason: "Customer-chosen hostnames, published in DNS until they are reset.",
    exportable: true,
  },
  proxmox_iso_downloads: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "The stored URL is customer-supplied and may carry credentials. Must go before any write to `users` - the foreign key is `restrict`, not `cascade`.",
    exportable: true,
  },
  orders: {
    ownership: { via: "user_id" },
    disposition: "anonymise",
    reason:
      "Kept as a booking document, with the billing address and the SSH public key inside `configuration` scrubbed.",
    basis: `Statutory retention, ${INVOICE_RETENTION_YEARS} years`,
    exportable: true,
  },
  order_items: {
    ownership: { via: "order" },
    disposition: "retain",
    reason: "Priced lines. No personal data beyond the link to the order.",
    basis: `Statutory retention, ${INVOICE_RETENTION_YEARS} years`,
    exportable: true,
  },
  order_transitions: {
    ownership: { via: "order" },
    disposition: "retain",
    reason: "Status history. No personal data.",
    basis: `Statutory retention, ${INVOICE_RETENTION_YEARS} years`,
    exportable: false,
  },
  payments: {
    ownership: { via: "user_id" },
    disposition: "retain",
    reason: "Accounting record. Provider identifiers only.",
    basis: `Statutory retention, ${INVOICE_RETENTION_YEARS} years`,
    exportable: true,
  },
  payment_events: {
    ownership: { via: "order" },
    disposition: "retain",
    reason: "Provider webhook ledger. No personal data.",
    basis: `Statutory retention, ${INVOICE_RETENTION_YEARS} years`,
    exportable: false,
  },
  invoices: {
    ownership: { via: "user_id" },
    disposition: "retain",
    reason:
      "The reason erasure is anonymisation rather than deletion. Cascading from `users` would destroy the record the tax office requires.",
    basis: `Statutory retention, ${INVOICE_RETENTION_YEARS} years`,
    exportable: true,
  },
  emails: {
    ownership: { via: "email" },
    disposition: "anonymise",
    reason:
      "Holds the full rendered body of every message sent, keyed by address. Bodies are cleared; subject and timestamp stay where the message is a commercial letter.",
    exportable: true,
  },
  data_exports: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "An export is a complete dossier on the person being erased. It goes first, and its bytes with it.",
    exportable: false,
  },
  account_deletion_tokens: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason: "Spent once the deletion they authorise has happened.",
    exportable: false,
  },
  abuse_cases: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "The customer's own side of a dispute about them. Goes with the account; the reporter's identity never appears in it.",
    exportable: true,
  },
  abuse_case_servers: {
    ownership: { via: "abuse_case" },
    disposition: "erase",
    reason: "Which of their machines a case locked, and for how long.",
    exportable: true,
  },
  abuse_case_messages: {
    ownership: { via: "abuse_case" },
    disposition: "erase",
    reason:
      "The correspondence. Exported without internal notes and without the reporter's address, both of which are somebody else's data.",
    exportable: true,
  },
  abuse_case_events: {
    ownership: { via: "abuse_case" },
    disposition: "erase",
    reason:
      "Internal audit of operator actions on the case. Erased with it; `erasure_log` is what outlives the account.",
    exportable: false,
  },
  abuse_signals: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "Raw inbound reports, carrying the reporter's identity and the provider's payload verbatim. The customer-facing account of the same events is the case and its thread.",
    exportable: false,
  },
  notification_deliveries: {
    ownership: { via: "user_id" },
    disposition: "erase",
    reason:
      "Delivery metadata for messages whose content is already exported under `emails`.",
    exportable: false,
  },
  erasure_log: {
    ownership: { via: "user_id" },
    disposition: "retain",
    reason:
      "Carries no personal data by construction, and has to outlive its subject to be evidence of anything.",
    basis: "Accountability, Article 5(2) GDPR",
    exportable: false,
  },
} as const satisfies Record<string, SubjectTable>;

export type SubjectTableName = keyof typeof SUBJECT_DATA;

/**
 * The same map, read through {@link SubjectTable}.
 *
 * `as const` above is what makes each entry self-documenting at the call site,
 * but it also narrows every entry to exactly the keys it happens to have - so
 * `basis` is simply absent on the ones that do not retain anything. This view
 * restores the uniform shape for code that iterates rather than looks up.
 */
export const subjectTables: Record<SubjectTableName, SubjectTable> =
  SUBJECT_DATA;

/**
 * Column names that must never reach a customer's export.
 *
 * Not a reminder - `subject-data.test.ts` asserts the serialised export
 * contains none of them, so an incautious `select *` fails the build rather
 * than mailing somebody their own OAuth tokens.
 */
export const NEVER_EXPORTED_COLUMNS = [
  "password",
  "access_token",
  "refresh_token",
  "id_token",
  "secret",
  "backup_codes",
  "key",
  "token",
  "token_hash",
  "root_password_ciphertext",
  "ciphertext",
  "wrapped_data_key",
  "token_id",
  "token_secret",
  "artifact",
] as const;

/** Tables whose rows are destroyed outright. */
export const tablesToErase = () => byDisposition("erase");

/** Tables that survive with their personal fields scrubbed. */
export const tablesToAnonymise = () => byDisposition("anonymise");

/** Tables kept whole, each under the legal basis it declares. */
export const tablesToRetain = () => byDisposition("retain");

const byDisposition = (disposition: Disposition): SubjectTableName[] =>
  (Object.keys(SUBJECT_DATA) as SubjectTableName[]).filter(
    (name) => SUBJECT_DATA[name].disposition === disposition,
  );
