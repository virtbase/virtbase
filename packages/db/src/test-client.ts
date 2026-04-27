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

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { relations } from "./relations";
import * as schema from "./schema";

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * Creates an in-memory Postgres (PGlite) database for testing.
 * Supports full transaction semantics unlike drizzle.mock().
 * Call in beforeAll() or at the start of each test file.
 */
export async function createTestDb() {
  // drizzle-kit v1 splits APIs by driver (`api-postgres` replaces `api`). Load lazily
  // to avoid circular init / TDZ issues with the test module graph.
  const { pushSchema } = await import("drizzle-kit/api-postgres");

  const client = new PGlite();
  const db = drizzle({
    client,
    relations,
    // pushSchema creates camelCase columns; omit casing so generated SQL matches
  });

  const { apply } = await pushSchema(schema, db as never);
  await apply();

  return db;
}
