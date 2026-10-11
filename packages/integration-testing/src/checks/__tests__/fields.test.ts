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
import * as z from "zod";
import { exampleManifest } from "../../__tests__/example/integration";
import { checkFields, checkFormDescriptor } from "../fields";

describe("checkFields", () => {
  test("accepts descriptors that match their schemas", () => {
    expect(checkFields(exampleManifest)).toEqual([]);
  });

  test("reports a schema key without a field", () => {
    expect(
      checkFields({
        ...exampleManifest,
        settings: {
          schema: z.object({ apiUrl: z.url(), region: z.string() }),
          fields: [{ key: "apiUrl", label: "API URL", widget: "url" }],
        },
      }),
    ).toEqual(["settings: schema key region has no field"]);
  });

  test("reports a field without a schema key", () => {
    expect(
      checkFields({
        ...exampleManifest,
        settings: {
          schema: z.object({ apiUrl: z.url() }),
          fields: [
            { key: "apiUrl", label: "API URL", widget: "url" },
            { key: "zone", label: "Zone", widget: "text" },
          ],
        },
      }),
    ).toEqual(["settings: field zone has no schema key"]);
  });

  test("reports select options that differ from the enum", () => {
    expect(
      checkFields({
        ...exampleManifest,
        settings: {
          schema: z.object({ mode: z.enum(["live", "test"]).optional() }),
          fields: [
            {
              key: "mode",
              label: "Mode",
              widget: "select",
              options: [{ value: "live", label: "Live" }],
            },
          ],
        },
      }),
    ).toEqual([
      "settings: select field mode offers [live] but the schema allows [live, test]",
    ]);
  });

  test("reports a select field whose schema is not an enum", () => {
    expect(
      checkFields({
        ...exampleManifest,
        settings: {
          schema: z.object({ mode: z.string() }),
          fields: [
            { key: "mode", label: "Mode", widget: "select", options: [] },
          ],
        },
      }),
    ).toEqual(["settings: select field mode needs an enum schema"]);
  });

  test("reports a secret field without the password widget", () => {
    expect(
      checkFields({
        ...exampleManifest,
        secrets: {
          schema: z.object({ apiKey: z.string() }),
          fields: [{ key: "apiKey", label: "API key", widget: "text" }],
        },
      }),
    ).toEqual(["secrets: field apiKey must use the password widget"]);
  });

  test("reports a schema that is not an object", () => {
    expect(
      checkFields({
        ...exampleManifest,
        settings: { schema: z.string(), fields: [] },
      }),
    ).toEqual(["settings: the schema must be a z.object"]);
  });
});

describe("checkFormDescriptor", () => {
  test("accepts a form whose secret keys use the password widget", () => {
    expect(
      checkFormDescriptor({
        label: "order",
        descriptor: {
          schema: z.object({ domain: z.string(), authCode: z.string() }),
          fields: [
            { key: "domain", label: "Domain", widget: "text" },
            { key: "authCode", label: "Auth code", widget: "password" },
          ],
        },
        secretKeys: ["authCode"],
      }),
    ).toEqual([]);
  });

  test("reports a secret key without a field", () => {
    expect(
      checkFormDescriptor({
        label: "order",
        descriptor: {
          schema: z.object({ domain: z.string() }),
          fields: [{ key: "domain", label: "Domain", widget: "text" }],
        },
        secretKeys: ["authCode"],
      }),
    ).toEqual(["order: secret key authCode has no field"]);
  });
});
