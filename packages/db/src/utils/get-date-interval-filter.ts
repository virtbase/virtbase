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

import { and, gte, lte } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export function getDateIntervalFilter(column: AnyPgColumn, input: number[]) {
  return input.length > 0
    ? and(
        input[0]
          ? gte(
              column,
              (() => {
                const date = new Date(input[0]);
                date.setHours(0, 0, 0, 0);
                return date;
              })(),
            )
          : undefined,
        input[1]
          ? lte(
              column,
              (() => {
                const date = new Date(input[1]);
                date.setHours(23, 59, 59, 999);
                return date;
              })(),
            )
          : undefined,
      )
    : undefined;
}
