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

import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

/**
 * Every table in a schema module, by its database name.
 *
 * The schema is passed in rather than imported: `schema/*` already imports
 * from `utils`, so reaching back the other way would close a cycle.
 */
export const listTableNames = (schema: Record<string, unknown>): string[] =>
  Object.values(schema)
    .filter((value): value is PgTable => is(value, PgTable))
    .map(getTableName);

/**
 * Tables carrying a column of the given database name.
 *
 * Exists so a test can ask "which tables hold something belonging to a user"
 * and compare that against a hand-maintained list, rather than trusting
 * everyone to remember to update the list. Adding a table with a `user_id` and
 * forgetting to say what happens to it on erasure then fails the build instead
 * of quietly surviving someone's account deletion.
 */
export const listTablesWithColumn = (
  schema: Record<string, unknown>,
  columnName: string,
): string[] =>
  Object.values(schema)
    .filter((value): value is PgTable => is(value, PgTable))
    .filter((table) =>
      getTableConfig(table).columns.some(
        (column) => column.name === columnName,
      ),
    )
    .map(getTableName);
