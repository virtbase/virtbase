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

import type { servers } from "@virtbase/db/schema";
import { getFiltersStateParser, getSortingStateParser } from "@virtbase/ui/lib";
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server";

export const searchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<typeof servers.$inferSelect>().withDefault([
    { id: "name", desc: false },
  ]),
  name: parseAsString.withDefault(""),
  vmid: parseAsInteger,
  createdAt: parseAsArrayOf(parseAsInteger).withDefault([]),
  terminatesAt: parseAsArrayOf(parseAsInteger).withDefault([]),
  // additional columns
  template: parseAsArrayOf(parseAsString).withDefault([]),
  // advanced filter
  filters: getFiltersStateParser().withDefault([]),
  joinOperator: parseAsStringEnum(["and", "or"]).withDefault("and"),
});

export type GetServersSchema = Awaited<
  ReturnType<typeof searchParamsCache.parse>
>;
