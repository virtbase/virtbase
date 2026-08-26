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
import * as schema from "@virtbase/db/schema";
import { listTableNames, listTablesWithColumn } from "@virtbase/db/utils";
import type { SubjectTableName } from "../subject-data";
import {
  NEVER_EXPORTED_COLUMNS,
  SUBJECT_DATA,
  subjectTables,
  tablesToAnonymise,
  tablesToErase,
  tablesToRetain,
} from "../subject-data";

const declared = new Set(Object.keys(SUBJECT_DATA));

describe("SUBJECT_DATA", () => {
  test("every table with a user_id column has a declared disposition", () => {
    // The guard against rot. A new table with a `user_id` that nobody thought
    // about would otherwise survive an account deletion in silence.
    const undeclared = listTablesWithColumn(schema, "user_id").filter(
      (name) => !declared.has(name),
    );

    expect(undeclared).toEqual([]);
  });

  test("every declared table actually exists in the schema", () => {
    // The mirror of the test above: catches a table renamed or dropped without
    // this map being updated, which would leave the eraser pointing at nothing.
    const existing = new Set<string>(listTableNames(schema));

    const missing = [...declared].filter((name) => !existing.has(name));

    expect(missing).toEqual([]);
  });

  test("retained tables say what justifies keeping them", () => {
    // "Retain" without a basis is just "we did not get round to deleting it",
    // and that is the version a regulator asks about.
    const withoutBasis = tablesToRetain().filter(
      (name) => !subjectTables[name].basis,
    );

    expect(withoutBasis).toEqual([]);
  });

  test("only retained tables carry a legal basis", () => {
    const names = Object.keys(SUBJECT_DATA) as SubjectTableName[];
    const misplaced = names.filter(
      (name) =>
        subjectTables[name].disposition === "erase" &&
        subjectTables[name].basis,
    );

    expect(misplaced).toEqual([]);
  });

  test("every table gives a reason", () => {
    const names = Object.keys(SUBJECT_DATA) as SubjectTableName[];
    const silent = names.filter(
      (name) => subjectTables[name].reason.trim().length === 0,
    );

    expect(silent).toEqual([]);
  });

  test("the three dispositions partition the map", () => {
    const total =
      tablesToErase().length +
      tablesToAnonymise().length +
      tablesToRetain().length;

    expect(total).toBe(Object.keys(SUBJECT_DATA).length);
  });

  test("the invoices row is what keeps erasure from cascading", () => {
    // Guarding the decision, not the data: flipping this to `erase` would make
    // a deletion destroy the accounting record, and the cascade means it would
    // do so quietly.
    expect(SUBJECT_DATA.invoices.disposition).toBe("retain");
    expect(SUBJECT_DATA.users.disposition).toBe("anonymise");
  });

  test("the erasure log outlives its subject", () => {
    expect(SUBJECT_DATA.erasure_log.disposition).toBe("retain");
  });
});

describe("NEVER_EXPORTED_COLUMNS", () => {
  test("it names columns that really exist somewhere in the schema", () => {
    // A forbidden column that matches nothing protects nothing, and would go
    // unnoticed after a rename.
    const orphans = NEVER_EXPORTED_COLUMNS.filter(
      (column) => listTablesWithColumn(schema, column).length === 0,
    );

    expect(orphans).toEqual([]);
  });

  test("no table holding secrets is marked exportable without care", () => {
    // `two_factors` is the clearest case: every column on it is a secret.
    expect(SUBJECT_DATA.two_factors.exportable).toBe(false);
    expect(SUBJECT_DATA.data_exports.exportable).toBe(false);
    expect(SUBJECT_DATA.account_deletion_tokens.exportable).toBe(false);
  });
});
