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
import { settingsSchema } from "../manifest";

describe("settingsSchema", () => {
  test("reads the form's false as false, so a switch can be turned off (C5)", () => {
    const settings = settingsSchema.parse({
      enrichCategories: "false",
      allowReporting: "true",
    });

    expect(settings.enrichCategories).toBe(false);
    expect(settings.allowReporting).toBe(true);
  });

  test("reads stored booleans as they are", () => {
    expect(
      settingsSchema.parse({ enrichCategories: true }).enrichCategories,
    ).toBe(true);
  });

  test("treats a blank number as unset, so the default applies (C5)", () => {
    const settings = settingsSchema.parse({
      confidenceThreshold: "",
      maxAgeInDays: "",
      blockPrefixLength: "",
      callsPerRun: "",
    });

    expect(settings).toMatchObject({
      confidenceThreshold: 50,
      maxAgeInDays: 30,
      blockPrefixLength: 24,
      callsPerRun: 4,
    });
  });

  test("reads every blank field the form sends as unset, so both switches are off (C5)", () => {
    const settings = settingsSchema.parse({
      confidenceThreshold: "",
      maxAgeInDays: "",
      blockPrefixLength: "",
      callsPerRun: "",
      enrichCategories: "",
      allowReporting: "",
    });

    expect(settings.enrichCategories).toBe(false);
    expect(settings.allowReporting).toBe(false);
  });

  test("reads a number the form sends as text", () => {
    expect(
      settingsSchema.parse({ confidenceThreshold: "75" }).confidenceThreshold,
    ).toBe(75);
  });

  test("rejects a block size outside 16 to 32", () => {
    expect(settingsSchema.safeParse({ blockPrefixLength: "8" }).success).toBe(
      false,
    );
  });
});
