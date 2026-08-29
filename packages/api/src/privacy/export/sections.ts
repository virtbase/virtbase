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

import type { SubjectTableName } from "../subject-data";

/**
 * Which section of the export each table's rows end up in.
 *
 * Two jobs. It renames the schema into something a customer recognises -
 * nobody asked for their `proxmox_iso_downloads` - and it is what lets a test
 * assert that every table marked `exportable` actually reaches the file. Add an
 * exportable table without a section here and the completeness test fails.
 */
export const EXPORT_SECTIONS = {
  users: "account",
  sessions: "sessions",
  accounts: "linked_accounts",
  passkeys: "passkeys",
  api_keys: "api_keys",
  ssh_keys: "ssh_keys",
  servers: "servers",
  server_backups: "backups",
  subnet_allocations: "ip_addresses",
  pointer_records: "reverse_dns",
  proxmox_iso_downloads: "custom_images",
  orders: "orders",
  // Nested inside each order rather than given a section of their own, because
  // a line item means nothing detached from what it was a line of.
  order_items: "orders",
  payments: "payments",
  invoices: "invoices",
  emails: "emails",
  abuse_cases: "abuse_cases",
  // Nested inside each case, like order items inside an order: a message or a
  // lock detached from the case it belongs to says nothing.
  abuse_case_messages: "abuse_cases",
  abuse_case_servers: "abuse_cases",
} as const satisfies Partial<Record<SubjectTableName, string>>;

export type ExportSection =
  (typeof EXPORT_SECTIONS)[keyof typeof EXPORT_SECTIONS];
