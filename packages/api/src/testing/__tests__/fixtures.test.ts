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

import { expect, test } from "bun:test";
import { prefixes } from "@virtbase/db/utils";
import * as fixtures from "../fixtures";

const ID = new RegExp(`^(${prefixes.join("|")})[A-Z0-9]{25}$`);

function ids(value: unknown, path: string): [string, unknown][] {
  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    key === "id" ? [[`${path}.id`, child]] : ids(child, `${path}.${key}`),
  );
}

test.each(
  Object.entries(fixtures).flatMap(([name, value]) => ids(value, name)),
)("%s is an ID the app accepts", (_path, id) => {
  expect(id).toMatch(ID);
});
