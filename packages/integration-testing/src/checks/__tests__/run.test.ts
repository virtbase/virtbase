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
import { runChecks } from "../run";

describe("runChecks", () => {
  test("returns one line per failed check, each against a fresh context", async () => {
    let contexts = 0;

    const failures = await runChecks(
      [
        { title: "passes", run: () => {} },
        {
          title: "fails",
          run: () => {
            throw new Error("expected 1");
          },
        },
        {
          title: "rejects",
          run: async () => {
            throw "not an Error";
          },
        },
      ],
      async () => ++contexts,
    );

    expect(failures).toEqual(["fails: expected 1", "rejects: not an Error"]);
    expect(contexts).toBe(3);
  });
});
