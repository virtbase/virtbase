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
import { collectSecretValues, createRedactor, REDACTED } from "../redact";

describe("collectSecretValues", () => {
  test("collects every string at any depth", () => {
    expect(
      collectSecretValues({
        apiKey: "key-1",
        nested: { token: "tok-2", port: 443 },
        list: ["s-3"],
      }),
    ).toEqual(["key-1", "tok-2", "s-3"]);
  });
});

describe("createRedactor", () => {
  const redactor = createRedactor(["sk-live-123", "sk-live-123456", "abc"]);

  test("replaces every secret, the longer one first", () => {
    expect(redactor.text("a sk-live-123456 b sk-live-123 c")).toBe(
      `a ${REDACTED} b ${REDACTED} c`,
    );
  });

  test("leaves values shorter than four characters alone", () => {
    expect(redactor.text("abc")).toBe("abc");
  });

  test("replaces the query string of every URL", () => {
    expect(
      redactor.text("GET https://api.example/v1/charge?amount=5&key=x failed"),
    ).toBe(`GET https://api.example/v1/charge?${REDACTED} failed`);
  });

  test("redacts strings inside fields, arrays and errors", () => {
    expect(
      redactor.fields({
        header: "Bearer sk-live-123",
        list: ["sk-live-123"],
        error: new Error("rejected sk-live-123"),
        count: 2,
      }),
    ).toEqual({
      header: `Bearer ${REDACTED}`,
      list: [REDACTED],
      error: `rejected ${REDACTED}`,
      count: 2,
    });
  });

  test("replaces the percent-encoded form of a secret", () => {
    const encoded = createRedactor(["s3cr3t/+=abc"]);

    expect(encoded.text("GET /token/s3cr3t%2F%2B%3Dabc")).toBe(
      `GET /token/${REDACTED}`,
    );
  });

  test("extend adds values without losing the declared ones", () => {
    const extended = redactor.extend(["interaction-token-1"]);

    expect(extended.text("/webhooks/1/interaction-token-1 sk-live-123")).toBe(
      `/webhooks/1/${REDACTED} ${REDACTED}`,
    );
  });

  test("survives a cycle, and stringifies dates and other objects", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;

    expect(
      redactor.fields({
        cyclic,
        at: new Date("2026-10-11T00:00:00Z"),
        url: new URL("https://api.example/v1?key=sk-live-123"),
      }),
    ).toEqual({
      cyclic: { name: "loop", self: "[circular]" },
      at: "2026-10-11T00:00:00.000Z",
      url: `https://api.example/v1?${REDACTED}`,
    });
  });
});
