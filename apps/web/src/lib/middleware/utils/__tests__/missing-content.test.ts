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
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isMissingContent, ROUTED_SEGMENTS } from "../missing-content.ts";

const content = {
  marketing: {
    "en/index.mdx": null,
    "en/open-source.mdx": null,
    "de/open-source.mdx": null,
    "en/company/index.mdx": null,
  },
  legal: { "en/privacy.mdx": null },
  help: { "en/about-security.mdx": null },
};

describe("isMissingContent", () => {
  test("finds a page in the requested locale", () => {
    expect(isMissingContent(content, "de", ["open-source"])).toBe(false);
  });

  test("falls back to the default locale, as the pages do", () => {
    expect(isMissingContent(content, "fr", ["open-source"])).toBe(false);
    expect(isMissingContent(content, "fr", ["legal", "privacy"])).toBe(false);
  });

  test("finds a directory index", () => {
    expect(isMissingContent(content, "en", ["company"])).toBe(false);
  });

  test("reports a page that no collection has", () => {
    expect(isMissingContent(content, "en", ["nope"])).toBe(true);
    expect(isMissingContent(content, "en", ["legal", "nope"])).toBe(true);
    expect(isMissingContent(content, "en", ["help", "article", "nope"])).toBe(
      true,
    );
  });

  test("leaves the home page and section indexes to their routes", () => {
    expect(isMissingContent(content, "en", [])).toBe(false);
    expect(isMissingContent(content, "en", ["legal"])).toBe(false);
    expect(isMissingContent(content, "en", ["help"])).toBe(false);
    expect(isMissingContent(content, "en", ["help", "article"])).toBe(false);
  });

  test("leaves routed segments to their own pages", () => {
    expect(isMissingContent(content, "en", ["checkout", "anything"])).toBe(
      false,
    );
  });
});

test("ROUTED_SEGMENTS names every static route under (public)/[locale]", () => {
  const routes = readdirSync(
    join(import.meta.dir, "../../../../app/(public)/[locale]"),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isDirectory() && !/^[[(]/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  expect([...ROUTED_SEGMENTS].sort()).toEqual(routes);
});
