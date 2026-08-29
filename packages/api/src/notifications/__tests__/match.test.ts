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
import { matchesAnyKey, matchesKey, meetsSeverity } from "../match";

describe("matchesKey", () => {
  test("matches everything for a bare star", () => {
    expect(matchesKey("*", "abuse.case.opened")).toBe(true);
    expect(matchesKey("*", "order.fulfilment_failed")).toBe(true);
  });

  test("matches a prefix for a trailing star", () => {
    expect(matchesKey("abuse.*", "abuse.case.opened")).toBe(true);
    expect(matchesKey("abuse.*", "abuse.lock.drift_detected")).toBe(true);
    expect(matchesKey("abuse.*", "order.paid")).toBe(false);
  });

  test("a trailing star does not need the dot", () => {
    expect(matchesKey("abuse*", "abuse.case.opened")).toBe(true);
  });

  test("`abuse.*` does not match the bare namespace", () => {
    // The dot is part of the prefix, so a key that is only the namespace is
    // not one of the things inside it.
    expect(matchesKey("abuse.*", "abuse")).toBe(false);
  });

  test("is exact without a star", () => {
    expect(matchesKey("abuse.case.opened", "abuse.case.opened")).toBe(true);
    expect(matchesKey("abuse.case.opened", "abuse.case.resolved")).toBe(false);
    expect(matchesKey("abuse.case", "abuse.case.opened")).toBe(false);
  });
});

describe("matchesAnyKey", () => {
  test("is true when one glob matches", () => {
    expect(
      matchesAnyKey(["order.*", "abuse.case.*"], "abuse.case.opened"),
    ).toBe(true);
  });

  test("is false for an empty list", () => {
    // A target that subscribes to nothing hears nothing, rather than
    // everything - the failure mode of the other default is a pager at 3am.
    expect(matchesAnyKey([], "abuse.case.opened")).toBe(false);
  });
});

describe("meetsSeverity", () => {
  test("passes at and above the floor", () => {
    expect(meetsSeverity("warning", "warning")).toBe(true);
    expect(meetsSeverity("warning", "critical")).toBe(true);
    expect(meetsSeverity("info", "info")).toBe(true);
  });

  test("blocks below the floor", () => {
    expect(meetsSeverity("warning", "info")).toBe(false);
    expect(meetsSeverity("critical", "warning")).toBe(false);
  });
});
