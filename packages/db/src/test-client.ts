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
 * A byte-for-byte snapshot of an empty database with the schema applied.
 *
 * `pushSchema` costs about 1.8s because it introspects the live database and
 * diffs the whole schema against it. That answer is the same for every test, so
 * it is computed once per process and every later database is restored from the
 * dump instead - about 0.3s, and no drizzle-kit on the hot path.
 *
 * The promise is memoised rather than the blob, so that callers racing during
 * the first build share it instead of each starting one.
 */
let template: Promise<Blob | File> | undefined;

function schemaTemplate() {
  template ??= (async () => {
    // drizzle-kit v1 splits APIs by driver (`api-postgres` replaces `api`). Load lazily
    // to avoid circular init / TDZ issues with the test module graph.
    const { pushSchema } = await import("drizzle-kit/api-postgres");

    const client = new PGlite();
    // pushSchema creates camelCase columns; omit casing so generated SQL matches
    const db = drizzle({ client, relations });

    const { apply } = await pushSchema(schema, db as never);
    await apply();

    const dump = await client.dumpDataDir("none");
    await client.close();

    return dump;
  })();

  return template;
}

/**
 * Creates an in-memory Postgres (PGlite) database for testing.
 * Supports full transaction semantics unlike drizzle.mock().
 * Call in beforeAll() or at the start of each test file.
 */
export async function createTestDb() {
  const client = new PGlite({ loadDataDir: await schemaTemplate() });
  await client.waitReady;

  // pushSchema creates camelCase columns; omit casing so generated SQL matches
  return drizzle({ client, relations });
}
