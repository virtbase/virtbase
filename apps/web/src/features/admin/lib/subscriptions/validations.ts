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

import type { RenewalStatus, subscriptions } from "@virtbase/db/schema";
import { getFiltersStateParser, getSortingStateParser } from "@virtbase/ui/lib";
import type { SubscriptionStatus } from "@virtbase/validators";
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  parseAsStringLiteral,
} from "nuqs/server";

/**
 * Every state a subscription can be in, in ladder order.
 *
 * Typed against the validators' enum rather than re-declared loosely, so a
 * status added to the domain is a type error here instead of a filter option
 * that silently stops existing.
 *
 * Unlike the abuse queue this has **no default filter**. An operator opening
 * this page is answering "why did this customer's server not renew", and the
 * answer is very often a subscription that has already ended — hiding the
 * terminal states by default would hide exactly the rows the ticket is about.
 */
export const SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "ended",
] as const satisfies readonly SubscriptionStatus[];

/**
 * Every state one collection attempt can be in.
 *
 * Rendered on the detail page rather than filtered on, but declared beside the
 * subscription statuses so both vocabularies live in one file. `RenewalStatus`
 * is the database's own enum, so this list cannot drift from the column.
 */
export const RENEWAL_STATUSES = [
  "pending",
  "collecting",
  "awaiting_action",
  "succeeded",
  "failed",
  "abandoned",
] as const satisfies readonly RenewalStatus[];

/**
 * The columns an operator may sort by, and the only ones.
 *
 * Passed to the parser rather than left open: the list query indexes
 * `subscriptions[item.id]` to build its `ORDER BY`, so an id that is not a
 * column would reach drizzle as `undefined`. Naming the set makes a crafted
 * `?sort=` fall back to the default instead.
 */
export const SORTABLE_SUBSCRIPTION_COLUMNS = new Set([
  "currentPeriodEnd",
  "currentPeriodStart",
  "createdAt",
  "status",
]);

export const searchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(20),
  sort: getSortingStateParser<typeof subscriptions.$inferSelect>(
    SORTABLE_SUBSCRIPTION_COLUMNS,
  ).withDefault([{ id: "currentPeriodEnd", desc: false }]),
  /** Matches the subscription id, the customer, or the subject's name. */
  q: parseAsString.withDefault(""),
  /**
   * Constrained to the vocabulary, for the same reason the sort parser above
   * is.
   *
   * These values reach Postgres as enum literals in an `IN (...)`, so a
   * crafted `?status=Active` used to make the whole query throw. The list
   * query catches and returns `{ data: [], pageCount: 0 }`, so what an
   * operator triaging a "why was I still charged" ticket saw was an empty
   * table with nothing to say anything had gone wrong — the worst possible
   * answer, because an empty result is also a real one.
   *
   * `parseAsArrayOf` drops items its item parser rejects, so an unknown status
   * is simply not a filter and the table stays unfiltered, exactly as a
   * crafted `?sort=` falls back to the default. It also types `input.status`
   * as `SubscriptionStatus[]`, which is what let the cast go from the `where`
   * clause.
   */
  status: parseAsArrayOf(
    parseAsStringLiteral(SUBSCRIPTION_STATUSES),
  ).withDefault([]),
  /**
   * Tri-state, not a boolean with a default.
   *
   * `null` is "do not filter"; `false` is a real question an operator asks —
   * "which of these will simply expire" — and a default of `false` would make
   * that indistinguishable from asking nothing.
   */
  autoRenew: parseAsBoolean,
  /**
   * Whether consent to charge off-session is on file.
   *
   * Worth filtering on its own: `auto_renew` true with no mandate is a
   * subscription that will try to collect and should not, which is the one
   * combination in this table that is a bug rather than a customer choice.
   */
  mandate: parseAsBoolean,
  currentPeriodEnd: parseAsArrayOf(parseAsInteger).withDefault([]),
  // advanced filter
  filters: getFiltersStateParser().withDefault([]),
  joinOperator: parseAsStringEnum(["and", "or"]).withDefault("and"),
});

export type GetSubscriptionsSchema = Awaited<
  ReturnType<typeof searchParamsCache.parse>
>;
