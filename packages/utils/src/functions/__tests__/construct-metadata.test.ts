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
import { APP_NAME } from "../../constants";
import { constructMetadata } from "../construct-metadata";

describe("constructMetadata", () => {
  test("it constructs the correct metadata with title and description", () => {
    const metadata = constructMetadata({
      title: "Test Title",
      description: "Test Description",
    });

    expect(metadata.title).toBe(`Test Title | ${APP_NAME}`);
    expect(metadata.description).toBe("Test Description");
  });

  test("it omits alternates when neither a url nor languages are given", () => {
    expect(
      constructMetadata({ title: "Test Title" }).alternates,
    ).toBeUndefined();
  });

  test("it keeps the canonical url when no languages are given", () => {
    const metadata = constructMetadata({
      canonicalUrl: "https://example.com/en/help",
    });

    expect(metadata.alternates?.canonical).toBe("https://example.com/en/help");
    expect(metadata.alternates?.languages).toBeUndefined();
  });

  test("it exposes the hreflang map alongside the canonical url", () => {
    const languages = {
      en: "https://example.com/en/help",
      de: "https://example.com/de/help",
      "x-default": "https://example.com/en/help",
    };

    const metadata = constructMetadata({
      canonicalUrl: "https://example.com/en/help",
      languages,
    });

    expect(metadata.alternates?.canonical).toBe("https://example.com/en/help");
    expect(metadata.alternates?.languages).toEqual(languages);
  });

  test("it exposes the hreflang map without a canonical url", () => {
    const metadata = constructMetadata({
      languages: { en: "https://example.com/en" },
    });

    expect(metadata.alternates?.canonical).toBeUndefined();
    expect(metadata.alternates?.languages).toEqual({
      en: "https://example.com/en",
    });
  });
});
