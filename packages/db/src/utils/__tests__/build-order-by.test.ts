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
import { asc, desc } from "drizzle-orm";
import { sshKeys } from "../../schema/ssh-keys";
import { buildOrderBy } from "../build-order-by";

describe("buildOrderBy", () => {
  test("it throws an error if the column is not found", () => {
    expect(() => buildOrderBy(sshKeys, ["invalid:asc"], sshKeys.id)).toThrow(
      Error,
    );
  });

  test("it returns the default column if no sort items are provided", () => {
    const orderBy = buildOrderBy(sshKeys, [], sshKeys.id);
    expect(orderBy).toEqual([asc(sshKeys.id)]);
  });

  test("it returns the correct order by columns for a given table and sort items", () => {
    const orderBy = buildOrderBy(
      sshKeys,
      ["name:asc", "created_at:desc"],
      sshKeys.id,
    );
    expect(orderBy).toEqual([asc(sshKeys.name), desc(sshKeys.createdAt)]);
  });
});
