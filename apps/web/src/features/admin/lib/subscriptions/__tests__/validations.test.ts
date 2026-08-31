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
import { searchParamsCache } from "../validations";

/**
 * What the operator's URL turns into.
 *
 * `createSearchParamsCache` memoises per request, so each case parses through
 * its own call and the assertions are on what `getSubscriptionsList` is then
 * handed - which is the only thing standing between a crafted query string and
 * a Postgres enum cast.
 */
describe("subscriptions search params", () => {
  test("a status outside the vocabulary is not a filter", () => {
    // `?status=Active` used to reach `inArray(subscriptions.status, ...)`
    // verbatim. Postgres refuses the literal, the list query's catch returns
    // `{ data: [], pageCount: 0 }`, and the operator triaging a "why was I
    // still charged" ticket got an empty table with no sign anything had gone
    // wrong. Dropping the value leaves the table unfiltered instead - the same
    // fallback a crafted `?sort=` gets from `SORTABLE_SUBSCRIPTION_COLUMNS`.
    expect(searchParamsCache.parse({ status: "Active" }).status).toEqual([]);
  });

  test("the statuses that do exist still filter", () => {
    expect(
      searchParamsCache.parse({ status: "past_due,suspended" }).status,
    ).toEqual(["past_due", "suspended"]);
  });

  test("one bad value in a list does not take the good ones with it", () => {
    expect(
      searchParamsCache.parse({ status: "past_due,Active,ended" }).status,
    ).toEqual(["past_due", "ended"]);
  });

  test("no status at all is no filter, which is this table's default", () => {
    // Deliberately unlike the abuse queue: an operator here is very often
    // looking for a subscription that has already ended.
    expect(searchParamsCache.parse({}).status).toEqual([]);
  });
});
