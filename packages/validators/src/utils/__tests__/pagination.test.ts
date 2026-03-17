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
import { getPaginationMeta } from "../../pagination";

describe("getPaginationMeta", () => {
  test("it returns the pagination meta for a list endpoint", () => {
    expect(getPaginationMeta({ total: 100, page: 1, perPage: 10 })).toEqual({
      page: 1,
      per_page: 10,
      previous_page: null,
      next_page: 2,
      last_page: 10,
      total_entries: 100,
    });
  });
});
