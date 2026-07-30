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

import { timingSafeEqual } from "node:crypto";

export function safeSecretCompare(
  provided: string | null,
  expected: string,
): boolean {
  const providedBuf = Buffer.from(provided ?? "", "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (providedBuf.length !== expectedBuf.length) {
    // Dummy compare to keep timing similar.
    const dummy = Buffer.alloc(expectedBuf.length);
    timingSafeEqual(expectedBuf, dummy);
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}
