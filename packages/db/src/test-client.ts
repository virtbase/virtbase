/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { createHash } from "node:crypto";
import { link, unlink } from "node:fs/promises";
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
 * it is computed once and every later database is restored from the dump
 * instead - about 0.2s, and no drizzle-kit on the hot path.
 *
 * The dump is kept on disk, keyed by the schema sources and the lockfile,
 * because test files run isolated: each one starts with a fresh module
 * registry, so an in-memory copy would be rebuilt for every file.
 *
 * The promise is memoised rather than the blob, so that callers racing during
 * the first build share it instead of each starting one.
 */
let template: Promise<Blob> | undefined;

async function templatePath() {
  const sources = await Array.fromAsync(
    new Bun.Glob("{schema/**/*.ts,relations.ts}").scan({
      cwd: import.meta.dir,
    }),
  );
  const hash = createHash("sha256");
  for (const file of sources.sort()) {
    hash
      .update(file)
      .update(await Bun.file(`${import.meta.dir}/${file}`).bytes());
  }
  hash.update(await Bun.file(`${import.meta.dir}/../../../bun.lock`).bytes());

  return `${import.meta.dir}/../.cache/test-db/${hash.digest("hex").slice(0, 16)}.tar`;
}

function schemaTemplate() {
  template ??= (async () => {
    const path = await templatePath();
    const cached = Bun.file(path);
    if (await cached.exists()) {
      return cached;
    }

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

    // `link` rather than `rename`: the first finished build wins and the file is
    // never replaced while another process may be reading it.
    const partial = `${path}.${process.pid}`;
    await Bun.write(partial, await dump.arrayBuffer());
    await link(partial, path).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    await unlink(partial);

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
