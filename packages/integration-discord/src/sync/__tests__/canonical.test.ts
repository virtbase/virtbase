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

import { canonical } from "../canonical";

describe("canonical", () => {
  test("key order is not a difference", () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });

  test("absent and empty are the same thing", () => {
    // Discord omits a field, nulls it, or answers with an empty object for the
    // same absent value depending on the endpoint.
    expect(canonical({ a: 1, options: [] })).toBe(canonical({ a: 1 }));
    expect(canonical({ a: 1, name_localizations: null })).toBe(
      canonical({ a: 1 }),
    );
    expect(canonical({ a: 1, meta: {} })).toBe(canonical({ a: 1 }));
  });

  test("fields outside `keep` are ignored", () => {
    // The id, application_id and version Discord adds must not read as drift.
    expect(canonical({ name: "menu", id: "1", version: "9" }, ["name"])).toBe(
      canonical({ name: "menu" }, ["name"]),
    );
  });

  test("a real difference still shows", () => {
    expect(canonical({ name: "menu" })).not.toBe(canonical({ name: "help" }));
  });

  test("it reaches into arrays and nested objects", () => {
    expect(canonical([{ b: 1, a: [{ d: 1, c: 2 }] }])).toBe(
      canonical([{ a: [{ c: 2, d: 1 }], b: 1 }]),
    );
  });
});

describe("canonical with `keep`", () => {
  test("it filters the records inside an array, not just a bare object", () => {
    // Discord answers with an array of commands, each carrying fields it added
    // itself. Losing the filter at the array boundary made every probe see
    // drift and re-register.
    expect(canonical([{ name: "menu", id: "1" }], ["name"])).toBe(
      canonical([{ name: "menu" }], ["name"]),
    );
  });

  test("it keeps a record's own contents whole", () => {
    // `options` is a command's arguments; filtering inside it would make two
    // commands differing only in their arguments compare equal.
    expect(
      canonical(
        [{ name: "a", options: [{ name: "x", required: true }] }],
        ["name", "options"],
      ),
    ).not.toBe(
      canonical(
        [{ name: "a", options: [{ name: "x", required: false }] }],
        ["name", "options"],
      ),
    );
  });
});
