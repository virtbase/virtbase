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
import { getGravatarImage } from "../get-gravatar-image";

describe("getGravatarImage", () => {
  test("it returns the correct gravatar image", async () => {
    expect(await getGravatarImage("example@example.com")).toBe(
      "https://seccdn.libravatar.org/avatar/31c5543c1734d25c7206f5fd591525d0295bec6fe84ff82f946a34fe970a1e66?d=identicon",
    );
  });
});
