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

import type { Transaction } from "@electric-sql/pglite";

/** What `seedRow` needs from a PGlite database or transaction. */
export type SeedExecutor = Pick<Transaction, "query">;

interface RequiredColumn {
  name: string;
  dataType: string;
  udtName: string;
  references: { table: string; column: string } | null;
}

/**
 * Inserts one row into `table` as the schema stands at that moment, and
 * returns it.
 *
 * Every `NOT NULL` column without a default that `values` leaves out gets a
 * placeholder of its type. A column with a foreign key gets a parent row,
 * inserted the same way, so a fixture names only the columns its migration is
 * about. The schema is read from the catalog on every call, because a fixture
 * runs between two migrations, against a schema the current code does not
 * declare.
 */
export const seedRow = async (
  db: SeedExecutor,
  table: string,
  values: Record<string, unknown> = {},
): Promise<Record<string, unknown>> => {
  const row: Record<string, unknown> = { ...values };
  for (const column of await listRequiredColumns(db, table)) {
    if (column.name in row) continue;
    row[column.name] = column.references
      ? (await seedRow(db, column.references.table))[column.references.column]
      : await placeholderFor(db, table, column);
  }

  const names = Object.keys(row);
  const columns = names.map((name) => `"${name}"`).join(", ");
  const placeholders = names.map((_, index) => `$${index + 1}`).join(", ");
  const { rows } = await db.query<Record<string, unknown>>(
    names.length === 0
      ? `INSERT INTO "${table}" DEFAULT VALUES RETURNING *`
      : `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`,
    names.map((name) => row[name]),
  );
  const inserted = rows[0];
  if (!inserted) throw new Error(`seedRow: no row returned for ${table}`);
  return inserted;
};

let sequence = 0;

const placeholderFor = async (
  db: SeedExecutor,
  table: string,
  column: RequiredColumn,
): Promise<unknown> => {
  sequence++;
  switch (column.dataType) {
    case "smallint":
    case "integer":
    case "bigint":
    case "numeric":
    case "real":
    case "double precision":
      return sequence;
    case "boolean":
      return false;
    case "timestamp with time zone":
    case "timestamp without time zone":
    case "date":
      return new Date();
    case "json":
    case "jsonb":
      return {};
    case "cidr":
      return `10.${sequence % 250}.0.0/24`;
    case "inet":
      return `10.${sequence % 250}.0.1`;
    case "USER-DEFINED":
      return firstEnumLabel(db, column.udtName);
    default:
      return `${table}_${column.name}_${sequence}`;
  }
};

const firstEnumLabel = async (db: SeedExecutor, type: string) => {
  const { rows } = await db.query<{ label: string }>(
    "SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1",
    [type],
  );
  const label = rows[0]?.label;
  if (label === undefined) throw new Error(`seedRow: ${type} is not an enum`);
  return label;
};

const listRequiredColumns = async (
  db: SeedExecutor,
  table: string,
): Promise<RequiredColumn[]> => {
  const { rows } = await db.query<{
    name: string;
    data_type: string;
    udt_name: string;
    foreign_table: string | null;
    foreign_column: string | null;
  }>(
    `SELECT c.column_name AS name, c.data_type, c.udt_name,
            fk.foreign_table, fk.foreign_column
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT a.attname AS column_name, cf.relname AS foreign_table,
                af.attname AS foreign_column
           FROM pg_constraint k
           JOIN pg_class ct ON ct.oid = k.conrelid
           JOIN pg_class cf ON cf.oid = k.confrelid
           JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
           JOIN pg_attribute af ON af.attrelid = k.confrelid AND af.attnum = k.confkey[1]
          WHERE k.contype = 'f' AND ct.relname = $1
       ) fk ON fk.column_name = c.column_name
      WHERE c.table_schema = 'public' AND c.table_name = $1
        AND c.is_nullable = 'NO' AND c.column_default IS NULL
        AND c.is_generated = 'NEVER' AND c.identity_generation IS NULL
      ORDER BY c.ordinal_position`,
    [table],
  );
  if (rows.length === 0) await assertTableExists(db, table);
  return rows.map((row) => ({
    name: row.name,
    dataType: row.data_type,
    udtName: row.udt_name,
    references:
      row.foreign_table && row.foreign_column
        ? { table: row.foreign_table, column: row.foreign_column }
        : null,
  }));
};

const assertTableExists = async (db: SeedExecutor, table: string) => {
  const { rows } = await db.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
    [table],
  );
  if (rows.length === 0) throw new Error(`seedRow: no table ${table}`);
};
