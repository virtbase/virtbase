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
import { sanitizeAbuseBody, sanitizeAbuseTitle } from "../sanitize";

// Built from code points rather than pasted in: an invisible character in a
// test file is unreviewable, and half of these are invisible by definition.
/** U+202E RIGHT-TO-LEFT OVERRIDE. */
const RLO = String.fromCharCode(0x202e);
/** U+200B ZERO WIDTH SPACE. */
const ZWSP = String.fromCharCode(0x200b);
/** U+0001 START OF HEADING, standing in for the C0 range. */
const SOH = String.fromCharCode(0x01);

describe("sanitizeAbuseTitle", () => {
  test("collapses whitespace onto one line", () => {
    expect(sanitizeAbuseTitle("  spam\n\nfrom   1.2.3.4  ")).toBe(
      "spam from 1.2.3.4",
    );
  });

  test("strips bidirectional overrides", () => {
    // Left in, one of these lets a reporter make the console display an
    // address that is not the one the case was opened about.
    const title = sanitizeAbuseTitle(`report${RLO}from 1.2.3.4`);

    expect(title).not.toContain(RLO);
    expect(title).toBe("report from 1.2.3.4");
  });

  test("strips zero-width characters", () => {
    expect(sanitizeAbuseTitle(`ab${ZWSP}use`)).toBe("ab use");
  });

  test("caps the length", () => {
    expect(sanitizeAbuseTitle("x".repeat(900))).toHaveLength(500);
  });

  test("an empty result is indistinguishable from an absent one", () => {
    expect(sanitizeAbuseTitle(`   ${ZWSP}  `)).toBeNull();
    expect(sanitizeAbuseTitle(undefined)).toBeNull();
    expect(sanitizeAbuseTitle(null)).toBeNull();
  });
});

describe("sanitizeAbuseBody", () => {
  test("keeps paragraphs, because a report is a letter", () => {
    expect(sanitizeAbuseBody("first\n\nsecond")).toBe("first\n\nsecond");
  });

  test("collapses runs of blank lines", () => {
    expect(sanitizeAbuseBody("first\n\n\n\n\nsecond")).toBe("first\n\nsecond");
  });

  test("collapses spaces without folding the newline", () => {
    expect(sanitizeAbuseBody("a    b\nc")).toBe("a b\nc");
  });

  test("still removes control characters", () => {
    expect(sanitizeAbuseBody(`a${SOH}b`)).toBe("a b");
  });
});
