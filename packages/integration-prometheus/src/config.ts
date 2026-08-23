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

import type { FieldDescriptor } from "@virtbase/integration-sdk";
import * as z from "zod";

/**
 * Every value the admin form submits is a string — `IntegrationField` renders a
 * `Switch` as `"true"`/`"false"` and a number input as text. These schemas
 * therefore parse from strings and hand integration code real booleans and
 * numbers, so nothing downstream re-does the coercion.
 *
 * An empty string means "the field was never filled in", which is the same
 * thing as the default, and not a validation error.
 *
 * The constraint that is easy to miss: `saveIntegrationSettingsAction` stores
 * the schema's *output*, and the registry re-parses that stored value on every
 * read. A transform here must therefore accept what it produces and return it
 * unchanged — `parse(parse(x))` has to equal `parse(x)`, or the integration
 * validates once when saved and fails to load forever after. Each field below
 * accepts both the form's string and its own parsed form for that reason, and
 * `settings round-trip through storage` in the tests is what holds the line.
 */
const formBoolean = (fallback: boolean) =>
  z
    .union([z.boolean(), z.enum(["true", "false", ""])])
    .default(fallback)
    .transform((value) => {
      if (typeof value === "boolean") return value;
      if (value === "") return fallback;
      return value === "true";
    });

/** Prometheus metric names match `[a-zA-Z_:][a-zA-Z0-9_:]*`; so must a prefix. */
const METRIC_PREFIX = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

export const DEFAULT_PREFIX = "virtbase_";

/**
 * Buckets for {@link MetricsSink.observe}, in milliseconds, spanning a single
 * API call to a provisioning run that has gone wrong. Prometheus histograms
 * cannot be rebucketed after the fact, so the range matters more than the
 * resolution: a value past the last bucket is only ever visible in `_sum`.
 */
export const DEFAULT_DURATION_BUCKETS_MS = [
  5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000,
  300_000,
];

/**
 * Bucket bounds as prom-client needs them: positive, unique and ascending. It
 * does not sort them itself, and unsorted bounds produce a histogram whose
 * cumulative counts are nonsense.
 *
 * Returns `null` when nothing usable is left, which the two callers below treat
 * differently.
 */
function normalizeBuckets(values: number[]): number[] | null {
  const usable = values.filter((entry) => Number.isFinite(entry) && entry > 0);
  if (usable.length === 0) return null;

  return [...new Set(usable)].sort((a, b) => a - b);
}

const bucketList = z
  .union([z.string(), z.array(z.number())])
  .default("")
  .transform((value, ctx) => {
    // An array is this schema's own output being read back from storage. It is
    // re-normalised rather than trusted, and a stored value that has somehow
    // become unusable falls back to the defaults instead of erroring — the
    // integration failing to load is a worse outcome than the wrong buckets.
    if (Array.isArray(value)) {
      return normalizeBuckets(value) ?? DEFAULT_DURATION_BUCKETS_MS;
    }

    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_DURATION_BUCKETS_MS;

    const parsed = normalizeBuckets(
      trimmed.split(",").map((entry) => Number(entry.trim())),
    );

    // A string, by contrast, is something an admin just typed, and telling them
    // it was not understood is the whole point of the form.
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message: "Enter positive numbers separated by commas, or leave blank.",
      });
      return z.NEVER;
    }

    return parsed;
  });

export const settingsSchema = z.object({
  prefix: z
    .string()
    .default(DEFAULT_PREFIX)
    .transform((value) => (value.trim() === "" ? DEFAULT_PREFIX : value.trim()))
    .refine((value) => METRIC_PREFIX.test(value), {
      message:
        "Must start with a letter, underscore or colon and contain only letters, digits, underscores and colons.",
    }),
  collectDefaultMetrics: formBoolean(true),
  collectPlatformMetrics: formBoolean(true),
  durationBucketsMs: bucketList,
});

export const secretsSchema = z.object({
  /**
   * Required, not optional: the scrape endpoint is a public route on the
   * marketing domain, and an unauthenticated one would publish the fleet's
   * size, revenue shape and node names to anyone who guessed the path.
   * Making it a required secret means the integration cannot be enabled
   * without one.
   */
  scrapeToken: z.string().min(16, "Use at least 16 characters."),
});

export type PrometheusSettings = z.output<typeof settingsSchema>;
export type PrometheusSecrets = z.output<typeof secretsSchema>;

export const settingsFields: FieldDescriptor<keyof PrometheusSettings>[] = [
  {
    key: "prefix",
    label: "Metric prefix",
    help: "Prepended to every metric name, including the Node.js runtime metrics.",
    widget: "text",
    placeholder: DEFAULT_PREFIX,
    optional: true,
  },
  {
    key: "collectDefaultMetrics",
    label: "Node.js runtime metrics",
    help: "Event loop lag, heap usage, garbage collection and open handles for the instance being scraped.",
    widget: "switch",
    optional: true,
  },
  {
    key: "collectPlatformMetrics",
    label: "Platform metrics",
    help: "Servers, backups, orders, payments and IP allocations, counted in the database at scrape time.",
    widget: "switch",
    optional: true,
  },
  {
    key: "durationBucketsMs",
    label: "Histogram buckets (ms)",
    help: "Comma-separated upper bounds for recorded durations. Leave blank for the default range of 5ms to 5 minutes.",
    widget: "text",
    placeholder: DEFAULT_DURATION_BUCKETS_MS.join(", "),
    optional: true,
  },
];

export const secretFields: FieldDescriptor<keyof PrometheusSecrets>[] = [
  {
    key: "scrapeToken",
    label: "Scrape token",
    help: "Prometheus sends this as a bearer token. Generate one with `openssl rand -hex 32`.",
    widget: "password",
  },
];
