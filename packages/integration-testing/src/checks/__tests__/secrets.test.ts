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
import { findSecretLeaks } from "../secrets";

describe("findSecretLeaks", () => {
  test("names every output that holds a secret value, at any depth", () => {
    expect(
      findSecretLeaks({
        outputs: {
          description: { name: "Example" },
          health: { nested: [{ message: "401 for key example-secret-key" }] },
          text: "example-secret-key",
        },
        secrets: ["example-secret-key", ""],
      }),
    ).toEqual([
      "health contains a secret value",
      "text contains a secret value",
    ]);
  });

  test("finds a secret with line breaks and quotes", () => {
    const pem = '-----BEGIN KEY-----\nabc"def\n-----END KEY-----';

    expect(
      findSecretLeaks({
        outputs: { error: { message: `bad key ${pem}` } },
        secrets: [pem],
      }),
    ).toEqual(["error contains a secret value"]);
  });

  test("searches an error's message and its cause chain", () => {
    const error = new Error("send failed", {
      cause: new Error(
        "POST https://hooks.example/in?sig=whsec-1 answered 500",
      ),
    });

    expect(
      findSecretLeaks({ outputs: { error }, secrets: ["whsec-1"] }),
    ).toEqual(["error contains a secret value"]);
  });
});
