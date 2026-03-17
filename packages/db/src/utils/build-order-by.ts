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

import type { AnyColumn, SQL, Table } from "drizzle-orm";
import { asc, desc, getTableColumns } from "drizzle-orm";
import type { SortableColumns } from "./types";

/**
 * Converts snake_case to camelCase for column lookup.
 * API models use snake_case while Drizzle table schemas use camelCase.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Resolves a column by API key (snake_case) or table key (camelCase).
 */
function resolveColumn(
  columns: Record<string, AnyColumn>,
  key: string,
): AnyColumn {
  const col = columns[key] ?? columns[snakeToCamel(key)];
  if (!col) throw new Error(`Unknown column: ${key}`);
  return col;
}

/**
 * Builds the order by columns for a given table and sort items.
 * Accepts API keys (snake_case) - TApiSelect is the API model type.
 * Table columns (camelCase) are resolved at runtime via normalization.
 *
 * @param table The table to build the order by for.
 * @param sortItems The sort items (API model keys) to build the order by for.
 * @param defaultColumn The default column to build the order by for.
 * @returns The order by columns.
 * @example
 * ```ts
 * const orderBy = buildOrderBy(sshKeys, ["name:asc", "created_at:desc"], sshKeys.id);
 * ```
 */
export function buildOrderBy<
  TApiSelect extends Record<string, unknown>,
  TTable extends Table = Table,
>(
  table: TTable,
  sortItems: SortableColumns<TApiSelect>,
  defaultColumn: AnyColumn,
): SQL[] {
  if (sortItems.length === 0) {
    return [asc(defaultColumn)];
  }

  const columns = getTableColumns(table);
  return sortItems.map((item) => {
    const [column, direction] = item.split(":") as [
      string,
      "asc" | "desc" | undefined,
    ];
    const col = resolveColumn(columns, column);
    return !direction || direction === "asc" ? asc(col) : desc(col);
  });
}
