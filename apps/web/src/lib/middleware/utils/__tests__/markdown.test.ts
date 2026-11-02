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

import { expect, test } from "bun:test";
import { hasMarkdown, markdownPath } from "../markdown.ts";

test("content pages have a Markdown form, forms do not", () => {
  expect(hasMarkdown([])).toBe(true);
  expect(hasMarkdown(["help", "article", "how-to-renew-server"])).toBe(true);
  expect(hasMarkdown(["datacenter"])).toBe(true);
  expect(hasMarkdown(["checkout", "plan_1"])).toBe(false);
  expect(hasMarkdown(["contact"])).toBe(false);
});

test("markdownPath points at the internal route", () => {
  expect(markdownPath("en", [])).toBe("/llms.mdx/en");
  expect(markdownPath("de", ["help", "category", "backups"])).toBe(
    "/llms.mdx/de/help/category/backups",
  );
});
