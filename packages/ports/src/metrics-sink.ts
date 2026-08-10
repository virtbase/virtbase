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

/** Low-cardinality dimensions only — never user ids, server ids or IPs. */
export type MetricLabels = Record<string, string>;

export interface MetricSample {
  /** Dotted metric name, e.g. `provisioning.duration`. */
  name: string;
  labels?: MetricLabels;
}

/**
 * Somewhere measurements go. Prometheus scrape and OTLP push are the first two
 * implementations; both receive the same calls.
 *
 * Recording is fire-and-forget by design: a metrics backend being down must
 * never fail a provisioning workflow, so implementations swallow their own
 * transport errors and report them through their health check instead.
 */
export interface MetricsSink {
  /** Monotonic count, e.g. servers provisioned. */
  increment(sample: MetricSample, by?: number): void;
  /** Point-in-time value, e.g. servers currently running. */
  gauge(sample: MetricSample, value: number): void;
  /** Distribution, e.g. provisioning duration in milliseconds, for p95 KPIs. */
  observe(sample: MetricSample, value: number): void;
  /** Flush buffered samples. Called on shutdown and by push-based sinks. */
  flush?(): Promise<void>;
}
