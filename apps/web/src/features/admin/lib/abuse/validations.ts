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

import type { abuseCases } from "@virtbase/db/schema";
import { getFiltersStateParser, getSortingStateParser } from "@virtbase/ui/lib";
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server";

/**
 * The statuses a case can still move through.
 *
 * The default filter, so the queue opens on what needs somebody rather than on
 * everything that ever happened. `resolved` and `rejected` are one click away
 * in the status filter - readable, just not in the way.
 */
export const ACTIVE_CASE_STATUSES = [
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
] as const;

export const ALL_CASE_STATUSES = [
  ...ACTIVE_CASE_STATUSES,
  "resolved",
  "rejected",
] as const;

export const CASE_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export const CASE_CATEGORIES = [
  "spam",
  "phishing",
  "malware",
  "port_scan",
  "ddos",
  "copyright",
  "compromised",
  "other",
] as const;

/** The enforcement ladder, weakest first. `terminate` is operator-only. */
export const ENFORCEMENT_LEVELS = [
  "none",
  "throttle",
  "isolate",
  "power_off",
  "terminate",
] as const;

export const searchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(20),
  sort: getSortingStateParser<typeof abuseCases.$inferSelect>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  /** Matches the reference, the title, or the customer's address. */
  title: parseAsString.withDefault(""),
  status: parseAsArrayOf(parseAsString).withDefault([...ACTIVE_CASE_STATUSES]),
  severity: parseAsArrayOf(parseAsString).withDefault([]),
  category: parseAsArrayOf(parseAsString).withDefault([]),
  createdAt: parseAsArrayOf(parseAsInteger).withDefault([]),
  filters: getFiltersStateParser().withDefault([]),
  joinOperator: parseAsStringEnum(["and", "or"]).withDefault("and"),
});

export type GetAbuseCasesSchema = Awaited<
  ReturnType<typeof searchParamsCache.parse>
>;
