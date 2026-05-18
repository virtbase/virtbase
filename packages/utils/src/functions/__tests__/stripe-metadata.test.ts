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
import {
  readChunkedStripeMetadata,
  writeChunkedStripeMetadata,
} from "../stripe-metadata";

describe("stripe metadata chunking", () => {
  test("short values are written as a single chunk", () => {
    const metadata = writeChunkedStripeMetadata("foo", "hello");
    expect(metadata).toEqual({ foo_count: "1", foo_0: "hello" });
    expect(readChunkedStripeMetadata(metadata, "foo")).toBe("hello");
  });

  test("empty values still produce a single (empty) chunk", () => {
    const metadata = writeChunkedStripeMetadata("foo", "");
    expect(metadata).toEqual({ foo_count: "1", foo_0: "" });
    expect(readChunkedStripeMetadata(metadata, "foo")).toBe("");
  });

  test("values exactly 500 chars fit in one chunk", () => {
    const value = "x".repeat(500);
    const metadata = writeChunkedStripeMetadata("foo", value);
    expect(Object.keys(metadata)).toEqual(["foo_count", "foo_0"]);
    expect(metadata.foo_count).toBe("1");
    expect(readChunkedStripeMetadata(metadata, "foo")).toBe(value);
  });

  test("values above 500 chars split into multiple chunks", () => {
    const value = "x".repeat(501);
    const metadata = writeChunkedStripeMetadata("foo", value);
    expect(metadata.foo_count).toBe("2");
    expect(metadata.foo_0?.length).toBe(500);
    expect(metadata.foo_1).toBe("x");
    expect(readChunkedStripeMetadata(metadata, "foo")).toBe(value);
  });

  test("round-trips realistic encrypted payloads (~1.2 KB)", () => {
    const value = "a".repeat(1200);
    const metadata = writeChunkedStripeMetadata("configurationSnapshot", value);
    expect(metadata.configurationSnapshot_count).toBe("3");
    expect(readChunkedStripeMetadata(metadata, "configurationSnapshot")).toBe(
      value,
    );
  });

  test("no Stripe metadata value exceeds the 500-char per-value limit", () => {
    const value = "a".repeat(5000);
    const metadata = writeChunkedStripeMetadata("foo", value);
    for (const [key, val] of Object.entries(metadata)) {
      expect(val.length, `chunk ${key}`).toBeLessThanOrEqual(500);
    }
  });

  test("legacy single-key entries are read transparently", () => {
    const metadata = { configurationSnapshot: "legacy-payload" };
    expect(readChunkedStripeMetadata(metadata, "configurationSnapshot")).toBe(
      "legacy-payload",
    );
  });

  test("missing entries return null", () => {
    expect(readChunkedStripeMetadata({}, "foo")).toBeNull();
    expect(readChunkedStripeMetadata(undefined, "foo")).toBeNull();
    expect(readChunkedStripeMetadata(null, "foo")).toBeNull();
    expect(
      readChunkedStripeMetadata({ other_count: "1", other_0: "x" }, "foo"),
    ).toBeNull();
  });

  test("malformed _count throws", () => {
    expect(() =>
      readChunkedStripeMetadata({ foo_count: "not-a-number" }, "foo"),
    ).toThrow(/not a valid positive integer/);
    expect(() => readChunkedStripeMetadata({ foo_count: "0" }, "foo")).toThrow(
      /not a valid positive integer/,
    );
  });

  test("missing chunk in the middle throws (refuses to truncate silently)", () => {
    const metadata = {
      foo_count: "3",
      foo_0: "aaaaa",
      foo_2: "ccccc",
    };
    expect(() => readChunkedStripeMetadata(metadata, "foo")).toThrow(
      /missing chunk 1 of 3/,
    );
  });

  test("does not collide with other base keys sharing a prefix", () => {
    const a = writeChunkedStripeMetadata("foo", "value-a");
    const b = writeChunkedStripeMetadata("foobar", "value-b");
    const merged = { ...a, ...b };
    expect(readChunkedStripeMetadata(merged, "foo")).toBe("value-a");
    expect(readChunkedStripeMetadata(merged, "foobar")).toBe("value-b");
  });
});
