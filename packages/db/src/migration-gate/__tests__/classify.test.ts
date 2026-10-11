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
import type { MigrationRisk } from "../classify";
import { classifyMigration, splitStatements } from "../classify";

const CASES: [string, MigrationRisk[]][] = [
  ['CREATE TABLE "a" ("id" text PRIMARY KEY);', []],
  ['ALTER TABLE "a" ADD COLUMN "b" text;', []],
  ['ALTER TABLE "a" ADD COLUMN "b" text DEFAULT \'x\' NOT NULL;', []],
  ['CREATE INDEX "i" ON "a" USING gist ("cidr" inet_ops);', []],
  ["ALTER TYPE \"s\" ADD VALUE 'new';", []],
  ['DROP TABLE "a";', []],
  ["COMMENT ON TABLE \"a\" IS 'x; y';", []],
  ['INSERT INTO "a" VALUES (1);', ["moves-data"]],
  ['/* c */ INSERT INTO "a" VALUES (1);', ["moves-data"]],
  ['-- c\nUPDATE "a" SET "b" = 1;', ["moves-data"]],
  ['WITH x AS (SELECT 1) UPDATE "a" SET "b" = 1;', ["moves-data"]],
  [
    'MERGE INTO "a" USING "b" ON true WHEN MATCHED THEN DELETE;',
    ["moves-data"],
  ],
  ['TRUNCATE "a";', ["moves-data"]],
  ['COPY "a" FROM STDIN;', ["moves-data"]],
  ['DO $$ BEGIN UPDATE "a" SET "b" = 1; END $$;', ["moves-data"]],
  [
    'CREATE TABLE "a" ("id" text); UPDATE "a" SET "id" = \'x\';',
    ["moves-data"],
  ],
  [
    'ALTER TABLE "a" ALTER COLUMN "b" SET DATA TYPE numeric(5,2) USING "b"::numeric(5,2);',
    ["rewrites-rows"],
  ],
  ['ALTER TABLE "a" ALTER COLUMN "b" SET NOT NULL;', ["constrains-rows"]],
  ['ALTER TABLE "a" ADD COLUMN "b" text NOT NULL;', ["constrains-rows"]],
  ['ALTER TABLE "a" ADD CONSTRAINT "u" UNIQUE("b");', ["constrains-rows"]],
  ['ALTER TABLE "a" ADD CONSTRAINT "c" CHECK ("b" > 0);', ["constrains-rows"]],
  [
    'ALTER TABLE "a" ADD CONSTRAINT "f" FOREIGN KEY ("b") REFERENCES "c"("id");',
    ["constrains-rows"],
  ],
  ['CREATE UNIQUE INDEX "u" ON "a" ("b");', ["constrains-rows"]],
];

describe("classifyMigration", () => {
  test.each(CASES)("%s", (sql, risks) => {
    expect(classifyMigration(sql)).toEqual(risks);
  });

  test("reports each risk once, sorted", () => {
    expect(
      classifyMigration(
        'UPDATE "a" SET "b" = 1;\nALTER TABLE "a" ALTER COLUMN "b" SET NOT NULL;\nDELETE FROM "a";',
      ),
    ).toEqual(["constrains-rows", "moves-data"]);
  });
});

describe("splitStatements", () => {
  test("ends statements at semicolons and drops comments and breakpoints", () => {
    expect(
      splitStatements(
        'CREATE TABLE "a" ();--> statement-breakpoint\n/* x; y */ DROP TABLE "b";',
      ),
    ).toEqual(['CREATE TABLE "a" ()', 'DROP TABLE "b"']);
  });

  test("keeps semicolons inside quotes, doubled quotes and dollar quotes", () => {
    expect(
      splitStatements(
        "SELECT 'it''s; fine', \"a;b\";DO $fn$ BEGIN PERFORM 1; END $fn$;",
      ),
    ).toEqual([
      "SELECT 'it''s; fine', \"a;b\"",
      "DO $fn$ BEGIN PERFORM 1; END $fn$",
    ]);
  });

  test("returns an unterminated tail as the last statement", () => {
    expect(splitStatements("DROP TABLE a; SELECT 'open")).toEqual([
      "DROP TABLE a",
      "SELECT 'open",
    ]);
  });
});
