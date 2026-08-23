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
  DEFAULT_DURATION_BUCKETS_MS,
  DEFAULT_PREFIX,
  secretsSchema,
  settingsSchema,
} from "../config";

/** What the admin form submits: every field a string, blanks for the untouched. */
const form = (overrides: Record<string, string> = {}) => ({
  prefix: "",
  collectDefaultMetrics: "",
  collectPlatformMetrics: "",
  durationBucketsMs: "",
  ...overrides,
});

describe("settings from the admin form", () => {
  test("a blank form is the defaults, not a validation error", () => {
    expect(settingsSchema.parse(form())).toEqual({
      prefix: DEFAULT_PREFIX,
      collectDefaultMetrics: true,
      collectPlatformMetrics: true,
      durationBucketsMs: DEFAULT_DURATION_BUCKETS_MS,
    });
  });

  test("an absent field is the same as a blank one", () => {
    expect(settingsSchema.parse({})).toEqual(settingsSchema.parse(form()));
  });

  test("switches arrive as strings and come out as booleans", () => {
    const parsed = settingsSchema.parse(
      form({ collectDefaultMetrics: "false", collectPlatformMetrics: "true" }),
    );

    expect(parsed.collectDefaultMetrics).toBe(false);
    expect(parsed.collectPlatformMetrics).toBe(true);
  });

  test("buckets are deduplicated and sorted, as prom-client requires", () => {
    expect(
      settingsSchema.parse(form({ durationBucketsMs: " 1000, 50 ,50, 250 " }))
        .durationBucketsMs,
    ).toEqual([50, 250, 1000]);
  });

  test("rejects what an admin typed by mistake", () => {
    expect(
      settingsSchema.safeParse(form({ durationBucketsMs: "fast, slow" }))
        .success,
    ).toBe(false);
    expect(settingsSchema.safeParse(form({ prefix: "9-nope" })).success).toBe(
      false,
    );
  });
});

describe("settings round-trip through storage", () => {
  /**
   * `saveIntegrationSettingsAction` stores the schema's output and the registry
   * re-parses it on every read, so a transform that cannot accept its own
   * result validates once when saved and then fails to load forever. That is a
   * silent, delayed failure — the integration is simply off, with the reason
   * only in a log line — so it is checked here field by field rather than left
   * to be found in production.
   */
  const cases: Record<string, Record<string, string>> = {
    "a blank form": form(),
    "custom values": form({
      prefix: "vb_",
      collectDefaultMetrics: "false",
      collectPlatformMetrics: "true",
      durationBucketsMs: "10, 100, 1000",
    }),
  };

  for (const [label, input] of Object.entries(cases)) {
    test(`${label} survives being saved and read back`, () => {
      const stored = settingsSchema.parse(input);

      // What the registry does on the next request.
      const reloaded = settingsSchema.safeParse(stored);

      expect(reloaded.success).toBe(true);
      expect(reloaded.data).toEqual(stored);
    });
  }

  test("the form can re-render a stored value", () => {
    // `toFormValues` in the settings form is `String(value)`, and the result
    // has to parse back to the same thing or editing one field would silently
    // change another.
    const stored = settingsSchema.parse(form({ durationBucketsMs: "10,100" }));

    const rerendered = Object.fromEntries(
      Object.entries(stored).map(([key, value]) => [key, String(value)]),
    );

    expect(settingsSchema.parse(rerendered)).toEqual(stored);
  });

  test("a stored value that has become unusable falls back to the defaults", () => {
    // Failing to load is a worse outcome than the wrong buckets.
    expect(
      settingsSchema.parse({ ...form(), durationBucketsMs: [] })
        .durationBucketsMs,
    ).toEqual(DEFAULT_DURATION_BUCKETS_MS);
  });
});

describe("secrets", () => {
  test("requires a token long enough to be worth having", () => {
    expect(secretsSchema.safeParse({ scrapeToken: "abc" }).success).toBe(false);
    expect(secretsSchema.safeParse({}).success).toBe(false);
  });

  test("round-trips", () => {
    const stored = secretsSchema.parse({ scrapeToken: "x".repeat(32) });
    expect(secretsSchema.parse(stored)).toEqual(stored);
  });
});
