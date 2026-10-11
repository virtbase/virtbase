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
import { countBlocks, splitIntoBlocks } from "../blocks";
import { MAX_CALLS_PER_RUN } from "../manifest";

describe("splitIntoBlocks", () => {
  test("splits a wider IPv4 range into blocks of the prefix length", () => {
    expect(splitIntoBlocks("10.0.0.0/22", 24)).toEqual([
      "10.0.0.0/24",
      "10.0.1.0/24",
      "10.0.2.0/24",
      "10.0.3.0/24",
    ]);
  });

  test("aligns a range written with host bits set", () => {
    expect(splitIntoBlocks("10.0.1.7/23", 24)).toEqual([
      "10.0.0.0/24",
      "10.0.1.0/24",
    ]);
  });

  test("splits across the top of the address space", () => {
    expect(splitIntoBlocks("255.255.254.0/23", 24)).toEqual([
      "255.255.254.0/24",
      "255.255.255.0/24",
    ]);
  });

  test("keeps a range as narrow as the prefix length, or narrower", () => {
    expect(splitIntoBlocks("10.0.0.0/24", 24)).toEqual(["10.0.0.0/24"]);
    expect(splitIntoBlocks("10.0.0.64/26", 24)).toEqual(["10.0.0.64/26"]);
  });

  test("keeps an IPv6 range as it is", () => {
    expect(splitIntoBlocks("2001:db8::/48", 24)).toEqual(["2001:db8::/48"]);
  });

  test("rejects a range without a prefix length instead of splitting the address space", () => {
    expect(() => splitIntoBlocks("10.0.0.0", 24)).toThrow(
      expect.objectContaining({ code: "abuseipdb.invalid_target" }),
    );
  });

  test("rejects a non-numeric prefix length instead of returning no blocks", () => {
    expect(() => splitIntoBlocks("10.0.0.0/x", 24)).toThrow(
      expect.objectContaining({ code: "abuseipdb.invalid_target" }),
    );
  });

  test("rejects an octet above 255 and a prefix length above 32", () => {
    expect(() => splitIntoBlocks("10.0.0.256/24", 24)).toThrow(
      expect.objectContaining({ code: "abuseipdb.invalid_target" }),
    );
    expect(() => splitIntoBlocks("10.0.0.0/33", 24)).toThrow(
      expect.objectContaining({ code: "abuseipdb.invalid_target" }),
    );
  });

  test("refuses a split into more blocks than one run may call", () => {
    expect(countBlocks("10.0.0.0/16", 26)).toBeGreaterThan(MAX_CALLS_PER_RUN);
    expect(() => splitIntoBlocks("10.0.0.0/16", 26)).toThrow(
      expect.objectContaining({ code: "abuseipdb.target_too_wide" }),
    );
  });
});

describe("countBlocks", () => {
  test("counts the blocks a range splits into without building them", () => {
    expect(countBlocks("10.0.0.0/16", 32)).toBe(65_536);
    expect(countBlocks("10.0.0.0/24", 26)).toBe(4);
  });

  test("counts a range as narrow as the prefix length, and an IPv6 range, as one", () => {
    expect(countBlocks("10.0.0.0/24", 20)).toBe(1);
    expect(countBlocks("2001:db8::/48", 24)).toBe(1);
  });

  test("rejects a malformed range", () => {
    expect(() => countBlocks("10.0.0/24", 24)).toThrow(
      expect.objectContaining({ code: "abuseipdb.invalid_target" }),
    );
  });
});
