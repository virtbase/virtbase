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
import { constructOpengraphUrl } from "../construct-opengraph-url";

describe("constructOpengraphUrl", () => {
  test("it constructs the correct opengraph URL with title, subtitle, slug, and theme", () => {
    const url = constructOpengraphUrl({
      title: "Test Title",
      subtitle: "Test Subtitle",
      slug: "test-slug",
      theme: "dark",
    });
    expect(url).toBe(
      "/api/og?title=Test%20Title&subtitle=Test%20Subtitle&slug=test-slug&theme=dark",
    );
  });

  test("it handles special characters", () => {
    const url = constructOpengraphUrl({
      title: "Test Title with special characters: &, ?, !",
    });
    expect(url).toBe(
      "/api/og?title=Test%20Title%20with%20special%20characters%3A%20%26%2C%20%3F%2C%20!&theme=dark",
    );
  });
});
