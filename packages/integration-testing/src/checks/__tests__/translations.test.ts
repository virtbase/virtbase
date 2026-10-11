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
import { exampleManifest } from "../../__tests__/example/integration";
import { checkNamespaces, checkTranslations } from "../translations";

const MARK = "~";
const t = (text: string) => `${MARK}${text}`;
const isTranslated = (text: string) => text.startsWith(MARK);

describe("checkTranslations", () => {
  test("accepts complete text that came through the translator", () => {
    expect(
      checkTranslations(
        exampleManifest,
        {
          name: t("Example"),
          description: t("Exercises the conformance suite."),
          fields: {
            apiUrl: { label: t("API URL") },
            mode: { label: t("Mode") },
            apiKey: { label: t("API key") },
          },
        },
        isTranslated,
      ),
    ).toEqual([]);
  });

  test("reports a missing name, description and field label", () => {
    expect(
      checkTranslations(
        exampleManifest,
        { fields: { apiUrl: { label: t("API URL") } } },
        isTranslated,
      ),
    ).toEqual([
      "localize: no name",
      "localize: no description",
      "localize: no label for field mode",
      "localize: no label for field apiKey",
    ]);
  });

  test("reports a string returned without the translator", () => {
    expect(
      checkTranslations(
        exampleManifest,
        {
          name: "Example",
          description: t("Exercises the conformance suite."),
          fields: {
            apiUrl: { label: t("API URL"), help: "Base URL." },
            mode: { label: t("Mode") },
            apiKey: { label: t("API key") },
          },
        },
        isTranslated,
      ),
    ).toEqual([
      "localize: name is not passed through t()",
      "localize: fields.apiUrl.help is not passed through t()",
    ]);
  });
});

describe("checkNamespaces", () => {
  test("accepts the integration's own namespace", () => {
    expect(checkNamespaces("example", ["example-integration"])).toEqual([]);
  });

  test("reports no call to getExtracted", () => {
    expect(checkNamespaces("example", [])).toEqual([
      "localize: never calls getExtracted",
    ]);
  });

  test("reports the root namespace and another integration's", () => {
    expect(
      checkNamespaces("example", [undefined, "discord-integration"]),
    ).toEqual([
      "localize: uses the namespace (none) instead of example-integration",
      "localize: uses the namespace discord-integration instead of example-integration",
    ]);
  });
});
