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

/**
 * Translation between the port's naming and Prometheus'.
 *
 * `MetricSample.name` is dotted (`provisioning.duration`), because the port is
 * written against no particular backend. Prometheus names must match
 * `[a-zA-Z_:][a-zA-Z0-9_:]*` and are snake_case by convention, and prom-client
 * throws on a name it considers invalid — which, in a fire-and-forget sink,
 * would turn a typo in a metric name into a thrown error inside a provisioning
 * workflow. Everything here is therefore total: it always returns a name, or
 * an empty string the caller drops the sample on.
 */

/** `[a-zA-Z_:][a-zA-Z0-9_:]*` — colons are reserved for recording rules, but legal. */
const INVALID_METRIC_CHARS = /[^a-zA-Z0-9_:]+/g;
/** Label names are the same minus the colon. */
const INVALID_LABEL_CHARS = /[^a-zA-Z0-9_]+/g;

/** `serverPlanId` -> `server_plan_id`, `HTTPStatus` -> `http_status`. */
function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function collapse(input: string): string {
  return input.replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * A dotted sample name as a Prometheus metric name, prefixed.
 *
 * Returns `""` when nothing legal survives sanitising — `increment({ name:
 * "..." })` should lose its sample and produce a warning, not invent a series
 * called `virtbase_`.
 */
export function toMetricName(name: string, prefix: string): string {
  const sanitized = collapse(
    toSnakeCase(name).replace(INVALID_METRIC_CHARS, "_"),
  );
  if (!sanitized) return "";

  const prefixed = `${prefix}${sanitized}`;

  // A metric name may not start with a digit. The prefix normally settles this;
  // an empty prefix leaves it to us.
  return /^[a-zA-Z_:]/.test(prefixed) ? prefixed : `_${prefixed}`;
}

/**
 * Counters carry a `_total` suffix by convention, and Grafana's query builder
 * and `rate()` linting both lean on it. Applied here rather than at the call
 * site so a caller cannot half-follow the convention.
 */
export function toCounterName(name: string, prefix: string): string {
  const metricName = toMetricName(name, prefix);
  if (!metricName) return "";
  return metricName.endsWith("_total") ? metricName : `${metricName}_total`;
}

/**
 * A label name, or `""` when nothing legal survives.
 *
 * `__` is reserved for Prometheus' own labels, so a leading underscore run is
 * stripped rather than passed through and silently dropped by the scraper.
 */
export function toLabelName(name: string): string {
  const sanitized = collapse(
    toSnakeCase(name).replace(INVALID_LABEL_CHARS, "_"),
  );
  if (!sanitized) return "";

  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

/**
 * Sanitised label names, deduplicated and sorted.
 *
 * Sorted so that the set a metric is created with does not depend on key order
 * in the first sample that happened to arrive.
 */
export function toLabelNames(labels: Record<string, string> | undefined) {
  if (!labels) return [] as string[];

  const names = new Set<string>();
  for (const key of Object.keys(labels)) {
    const name = toLabelName(key);
    if (name) names.add(name);
  }

  return [...names].sort();
}

/**
 * A sample's labels projected onto the set the metric was created with.
 *
 * prom-client throws on a label it was not told about at construction, and a
 * metric's label set is fixed for the life of the process. Projecting means a
 * later sample carrying an extra dimension loses that dimension instead of
 * losing the whole sample, and one missing a dimension records under the empty
 * string — which is how Prometheus represents an absent label anyway.
 */
export function projectLabels(
  labels: Record<string, string> | undefined,
  declared: readonly string[],
): Record<string, string> {
  const projected: Record<string, string> = {};
  for (const name of declared) projected[name] = "";
  if (!labels) return projected;

  for (const [key, value] of Object.entries(labels)) {
    const name = toLabelName(key);
    if (name in projected) projected[name] = String(value ?? "");
  }

  return projected;
}
