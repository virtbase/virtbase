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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { seedRow } from "../seed-row";

const client = new PGlite();

beforeAll(async () => {
  await client.exec(`
    CREATE TYPE colours AS ENUM ('red', 'green');
    CREATE TABLE groups (
      id text PRIMARY KEY,
      colour colours NOT NULL,
      network cidr NOT NULL,
      gateway inet NOT NULL,
      weight smallint NOT NULL,
      active boolean NOT NULL,
      meta jsonb NOT NULL,
      seen_at timestamptz NOT NULL,
      note text
    );
    CREATE TABLE counters (id serial PRIMARY KEY, total integer NOT NULL DEFAULT 0);
    CREATE TABLE members (
      id text PRIMARY KEY,
      group_id text NOT NULL REFERENCES groups(id),
      role text NOT NULL DEFAULT 'member',
      serial integer GENERATED ALWAYS AS IDENTITY
    );
  `);
});

afterAll(async () => {
  await client.close();
});

describe("seedRow", () => {
  test("fills required columns with placeholders of their type", async () => {
    const group = await seedRow(client, "groups");

    expect(group.colour).toBe("red");
    expect(String(group.network)).toMatch(/^10\.\d+\.0\.0\/24$/);
    expect(String(group.gateway)).toMatch(/^10\.\d+\.0\.1$/);
    expect(typeof group.weight).toBe("number");
    expect(group.active).toBe(false);
    expect(group.meta).toEqual({});
    expect(group.seen_at).toBeInstanceOf(Date);
    expect(group.note).toBeNull();
  });

  test("creates the parent of a required foreign key", async () => {
    const member = await seedRow(client, "members");
    const { rows } = await client.query("SELECT 1 FROM groups WHERE id = $1", [
      member.group_id,
    ]);

    expect(rows).toHaveLength(1);
  });

  test("keeps the values given, and leaves defaults and identities to the database", async () => {
    const group = await seedRow(client, "groups", { id: "grp_given" });
    const member = await seedRow(client, "members", {
      id: "mbr_given",
      group_id: group.id,
    });

    expect(member).toMatchObject({
      id: "mbr_given",
      group_id: "grp_given",
      role: "member",
    });
    expect(typeof member.serial).toBe("number");
  });

  test("inserts defaults only into a table whose columns all have one", async () => {
    expect(await seedRow(client, "counters")).toEqual({ id: 1, total: 0 });
  });

  test("throws for a table that does not exist", async () => {
    await expect(seedRow(client, "missing")).rejects.toThrow(
      "seedRow: no table missing",
    );
  });
});
