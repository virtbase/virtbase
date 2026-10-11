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
import type { Transaction } from "@electric-sql/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { classifyMigration } from "../migration-gate/classify";
import { relations } from "../relations";
import * as schema from "../schema";

const MIGRATIONS = `${import.meta.dir}/../../drizzle`;

/**
 * The gate applies to migrations whose folder name sorts at or after this
 * prefix, the day it started. Earlier migrations had run in production before
 * it; risk C26 tracks fixtures for their data statements.
 */
const GATE_STARTED = "20261011";

interface Migration {
  name: string;
  sql: string;
}

type Executor = Pick<Transaction, "exec" | "query">;

/**
 * Data a migration is tested with (DB-14): `seed` runs before the migration,
 * `verify` after it, in the same transaction.
 */
interface Fixture {
  seed: (db: Executor) => Promise<void>;
  verify: (db: Executor) => Promise<void>;
}

/** The fixture of a migration, keyed by its folder name. */
const FIXTURES: Record<string, Fixture> = {};

const readMigrations = async (): Promise<Migration[]> => {
  const files = await Array.fromAsync(
    new Bun.Glob("*/migration.sql").scan({ cwd: MIGRATIONS }),
  );
  return Promise.all(
    files.sort().map(async (file) => ({
      name: file.slice(0, file.indexOf("/")),
      sql: await Bun.file(`${MIGRATIONS}/${file}`).text(),
    })),
  );
};

const applyOne = async (
  db: Executor,
  { name, sql }: Migration,
  fixtures: Record<string, Fixture>,
) => {
  await fixtures[name]?.seed(db);
  await db.exec(sql);
  await fixtures[name]?.verify(db);
};

/**
 * Applies `migrations` in order, running each one's fixture around it.
 *
 * `exec` runs a file's statements as a script. Drizzle's PGlite migrator sends
 * each chunk between breakpoints as one prepared statement, which PostgreSQL
 * refuses for more than one command, and
 * `20260501154827_nostalgic_silvermane` has two commands in one chunk.
 *
 * The migrations from `GATE_STARTED` on run in one transaction, as
 * `drizzle-kit migrate` applies a deploy's pending migrations, so a migration
 * that only works after an earlier one commits, such as using an enum value
 * added in the same deploy, fails here too.
 */
const applyMigrations = async (
  client: PGlite,
  migrations: Migration[],
  fixtures: Record<string, Fixture>,
) => {
  const before = migrations.filter(({ name }) => name < GATE_STARTED);
  const after = migrations.filter(({ name }) => name >= GATE_STARTED);
  for (const migration of before) await applyOne(client, migration, fixtures);
  await client.transaction(async (tx) => {
    for (const migration of after) await applyOne(tx, migration, fixtures);
  });
};

describe("migrations", () => {
  test("apply in order to an empty database and produce the declared schema", async () => {
    const client = new PGlite();
    try {
      await applyMigrations(client, await readMigrations(), FIXTURES);

      const { pushSchema } = await import("drizzle-kit/api-postgres");
      const { sqlStatements } = await pushSchema(
        schema,
        drizzle({ client, relations }),
      );

      expect(sqlStatements).toEqual([]);
    } finally {
      await client.close();
    }
  }, 60_000);

  test("every migration since the gate that touches existing rows has a fixture", async () => {
    const unseeded = (await readMigrations())
      .filter(({ name }) => name >= GATE_STARTED && !FIXTURES[name])
      .filter(({ sql }) => classifyMigration(sql).length > 0)
      .map(({ name }) => name);

    expect(unseeded).toEqual([]);
  });

  test("a fixture seeds before its migration and verifies after it", async () => {
    const client = new PGlite();
    const order: string[] = [];
    try {
      await applyMigrations(
        client,
        [
          {
            name: "20261012_create",
            sql: "CREATE TABLE plans (id int, price int);",
          },
          {
            name: "20261013_reprice",
            sql: "UPDATE plans SET price = price * 2;",
          },
        ],
        {
          "20261013_reprice": {
            seed: async (db) => {
              order.push("seed");
              await db.exec("INSERT INTO plans VALUES (1, 5);");
            },
            verify: async (db) => {
              order.push("verify");
              const { rows } = await db.query<{ price: number }>(
                "SELECT price FROM plans",
              );
              expect(rows).toEqual([{ price: 10 }]);
            },
          },
        },
      );

      expect(order).toEqual(["seed", "verify"]);
    } finally {
      await client.close();
    }
  });

  test("the migrations since the gate run in one transaction", async () => {
    const client = new PGlite();
    try {
      const applying = applyMigrations(
        client,
        [
          { name: "20261010_enum", sql: "CREATE TYPE s AS ENUM ('a');" },
          { name: "20261013_value", sql: "ALTER TYPE s ADD VALUE 'b';" },
          { name: "20261014_use", sql: "SELECT 'b'::s;" },
        ],
        {},
      );

      await expect(applying).rejects.toThrow("unsafe use of new value");
    } finally {
      await client.close();
    }
  });
});
