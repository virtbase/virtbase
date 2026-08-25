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

import { sparkline, summarize } from "../chart";

describe("sparkline", () => {
  test("it is exactly as wide as it was asked to be", () => {
    expect([...sparkline([1, 2, 3], { width: 10 })]).toHaveLength(10);
    expect([...sparkline(Array(500).fill(1), { width: 34 })]).toHaveLength(34);
  });

  test("a rising series rises", () => {
    const drawn = sparkline([0, 1, 2, 3, 4, 5, 6, 7], { width: 8 });

    expect(drawn).toBe("▁▂▃▄▅▆▇█");
  });

  test("an explicit ceiling is what the shape is measured against", () => {
    // A server idling at 5% must look idle, not full. Scaling to the series'
    // own maximum is what made an idle graph look alarming.
    expect(sparkline([0.05, 0.05, 0.05], { width: 3, max: 1 })).toBe("▁▁▁");
    expect(sparkline([0.05, 0.05, 0.05], { width: 3 })).toBe("███");
  });

  test("a flat-zero series draws a floor, not an empty string", () => {
    // "Nothing happened" and "no data" are different answers.
    expect(sparkline([0, 0, 0], { width: 3 })).toBe("▁▁▁");
  });

  test("buckets with no samples stay blank", () => {
    // Two samples over ten columns: eight columns have nothing to average.
    const drawn = sparkline([1, 2], { width: 10 });

    expect(drawn).toHaveLength(10);
    expect(drawn).toContain(" ");
  });

  test("it averages rather than samples, so a spike cannot hide", () => {
    // One spike in the second half must lift that half off the floor.
    const values = [...Array(50).fill(0), 100, ...Array(49).fill(0)];
    const drawn = sparkline(values, { width: 2 });

    expect(drawn[0]).toBe("▁");
    expect(drawn[1]).not.toBe("▁");
  });

  test("no data draws nothing", () => {
    expect(sparkline([], { width: 10 })).toBe("");
  });

  test("it never emits a character outside the block scale", () => {
    const allowed = new Set([..."▁▂▃▄▅▆▇█", " "]);
    const drawn = sparkline([0, 5, -3, 999, 0.5], { width: 20 });

    for (const char of drawn) expect(allowed.has(char), char).toBe(true);
  });
});

describe("summarize", () => {
  test("it reports the four numbers printed under a chart", () => {
    expect(summarize([2, 8, 4, 6])).toEqual({
      min: 2,
      max: 8,
      avg: 5,
      last: 6,
    });
  });

  test("an empty series is zeroes rather than NaN", () => {
    // NaN would render as "NaN%" to a customer.
    expect(summarize([])).toEqual({ min: 0, max: 0, avg: 0, last: 0 });
  });
});
