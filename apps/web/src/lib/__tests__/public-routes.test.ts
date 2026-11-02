/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, test } from "bun:test";
import { hasMarkdown, matchPublicRoute, publicPath } from "../public-routes.ts";

describe("matchPublicRoute", () => {
  test("names every kind of public page", () => {
    expect(matchPublicRoute([])).toEqual({ kind: "marketing", slugs: [] });
    expect(matchPublicRoute(["datacenter"])).toEqual({
      kind: "marketing",
      slugs: ["datacenter"],
    });
    expect(matchPublicRoute(["legal", "terms"])).toEqual({
      kind: "legal",
      slugs: ["terms"],
    });
    expect(matchPublicRoute(["help"])).toEqual({ kind: "help" });
    expect(matchPublicRoute(["help", "category", "backups"])).toEqual({
      kind: "help-category",
      category: "backups",
    });
    expect(matchPublicRoute(["help", "article", "x"])).toEqual({
      kind: "help-article",
      slugs: ["x"],
    });
    expect(matchPublicRoute(["authors", "janic"])).toEqual({
      kind: "author",
      slug: "janic",
    });
    expect(matchPublicRoute(["checkout", "plan_1"])).toEqual({ kind: "page" });
  });

  test("rejects paths no route serves", () => {
    for (const segments of [
      ["help", "nope"],
      ["help", "category"],
      ["help", "category", "nope"],
      ["authors"],
      ["authors", "janic", "x"],
    ]) {
      expect(matchPublicRoute(segments)).toBeNull();
    }
  });
});

test("publicPath is the inverse of matchPublicRoute", () => {
  for (const path of [
    "",
    "/datacenter",
    "/legal/terms",
    "/help",
    "/help/category/backups",
    "/help/article/how-to-renew-server",
    "/authors/janic",
  ]) {
    const route = matchPublicRoute(path.split("/").filter(Boolean));
    if (!hasMarkdown(route)) throw new Error(`no content route for "${path}"`);
    expect(publicPath(route)).toBe(path);
  }
});

test("forms have no Markdown form", () => {
  expect(hasMarkdown(matchPublicRoute(["contact"]))).toBe(false);
  expect(hasMarkdown(matchPublicRoute(["help", "nope"]))).toBe(false);
  expect(hasMarkdown(matchPublicRoute(["help"]))).toBe(true);
});
