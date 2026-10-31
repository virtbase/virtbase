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
import { mapSettled } from "../map-settled";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapSettled", () => {
  test("returns one result per item, in input order", async () => {
    const results = await mapSettled(
      [30, 10, 20],
      { concurrency: 3 },
      async (ms) => {
        await delay(ms);
        return ms * 2;
      },
    );

    expect(results).toEqual([
      { status: "fulfilled", value: 60 },
      { status: "fulfilled", value: 20 },
      { status: "fulfilled", value: 40 },
    ]);
  });

  test("never runs more calls at once than the concurrency allows", async () => {
    let running = 0;
    let peak = 0;

    await mapSettled(
      Array.from({ length: 10 }, (_, i) => i),
      { concurrency: 3 },
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await delay(5);
        running -= 1;
      },
    );

    expect(peak).toBe(3);
  });

  test("settles a rejection on its own item and still runs the others", async () => {
    const failure = new Error("unreachable");
    const results = await mapSettled(
      ["a", "b", "c"],
      { concurrency: 1 },
      async (item) => {
        if (item === "b") throw failure;
        return item;
      },
    );

    expect(results).toEqual([
      { status: "fulfilled", value: "a" },
      { status: "rejected", reason: failure },
      { status: "fulfilled", value: "c" },
    ]);
  });

  test("returns an empty list for no items", async () => {
    expect(await mapSettled([], { concurrency: 4 }, async () => 1)).toEqual([]);
  });

  test("rejects a concurrency that is not a positive integer", async () => {
    await expect(
      mapSettled([1], { concurrency: 0 }, async () => 1),
    ).rejects.toThrow(RangeError);
  });
});
