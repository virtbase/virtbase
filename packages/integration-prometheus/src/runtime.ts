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

import type { IntegrationLogger } from "@virtbase/integration-sdk";
import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";
import type { PrometheusSettings } from "./manifest";

export interface RuntimeOptions {
  prefix: string;
  collectDefaultMetrics: boolean;
  durationBucketsMs: number[];
}

/** The metric half of {@link MetricEntry}, keyed by its prom-client kind. */
type ClaimedMetric =
  | { kind: "counter"; metric: Counter }
  | { kind: "gauge"; metric: Gauge }
  | { kind: "histogram"; metric: Histogram };

/** A registered metric, tagged with the prom-client kind it was registered as. */
type MetricEntry = { labelNames: readonly string[] } & ClaimedMetric;

/** The constructor options every prom-client metric kind shares. */
type MetricConfig = ReturnType<MetricsRuntime["toMetricConfig"]>;

/**
 * The process-wide prom-client state.
 *
 * A scrape-based sink is stateful in a way the other ports are not: a counter
 * has to be the same object between the increment and the scrape, and
 * prom-client throws if a name is registered on a registry twice. The registry
 * therefore cannot live on the adapter, which the integration registry rebuilds
 * whenever its 30-second config cache expires or an admin saves a setting — a
 * per-adapter registry would reset every counter on a TTL and lose every sample
 * recorded before the current scrape.
 *
 * So there is exactly one of these per process, and the adapter is a handle
 * onto it.
 */
export class MetricsRuntime {
  readonly registry = new Registry();
  readonly prefix: string;
  readonly durationBucketsMs: number[];
  /** Identity of the configuration this runtime was built for. */
  readonly signature: string;

  private readonly metrics = new Map<string, MetricEntry>();

  /** Names already complained about, so a bad call site logs once, not per sample. */
  private readonly warned = new Set<string>();

  constructor(options: RuntimeOptions) {
    this.prefix = options.prefix;
    this.durationBucketsMs = options.durationBucketsMs;
    this.signature = signatureOf(options);

    if (options.collectDefaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: options.prefix,
      });
    }
  }

  /** `servers` -> `virtbase_servers`. */
  name(suffix: string): string {
    return `${this.prefix}${suffix}`;
  }

  /**
   * The counter named `spec.name`, created on first use. Returns null when the
   * name is registered as another kind, or by `collectDefaultMetrics`, through
   * {@link claim}. {@link gauge} and {@link histogram} behave the same.
   */
  counter(spec: MetricSpec): Counter | null {
    return this.claim(spec, {
      pick: (entry) => (entry.kind === "counter" ? entry.metric : null),
      create: (config) => ({ kind: "counter", metric: new Counter(config) }),
    });
  }

  gauge(spec: MetricSpec): Gauge | null {
    return this.claim(spec, {
      pick: (entry) => (entry.kind === "gauge" ? entry.metric : null),
      create: (config) => ({ kind: "gauge", metric: new Gauge(config) }),
    });
  }

  histogram(spec: MetricSpec & { buckets?: number[] }): Histogram | null {
    return this.claim(spec, {
      pick: (entry) => (entry.kind === "histogram" ? entry.metric : null),
      create: (config) => ({
        kind: "histogram",
        metric: new Histogram({
          ...config,
          buckets: spec.buckets ?? this.durationBucketsMs,
        }),
      }),
    });
  }

  /**
   * The label names a metric was created with, or `null` when it does not
   * exist yet.
   *
   * The `null` matters: a metric created from a sample that carried no labels
   * has an empty label set for the rest of the process, and is not the same
   * thing as a metric that has yet to be created. Collapsing the two would let
   * a later, labelled sample be applied to a metric that rejects labels.
   */
  labelNamesOf(name: string): readonly string[] | null {
    return this.metrics.get(name)?.labelNames ?? null;
  }

  warnOnce(key: string, logger: IntegrationLogger, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    logger.warn(message);
  }

  /**
   * The metric named `spec.name` if `pick` accepts its kind, registering it
   * through `create` when no metric has the name.
   *
   * Returns null when the name is held by another kind, or by a metric this
   * runtime did not register, such as one of `collectDefaultMetrics`: prom-client
   * throws on a second registration of a name, and the port promises never to
   * throw at its caller.
   */
  private claim<M>(
    spec: MetricSpec,
    {
      pick,
      create,
    }: {
      pick: (entry: MetricEntry) => M | null;
      create: (config: MetricConfig) => ClaimedMetric;
    },
  ): M | null {
    const existing = this.metrics.get(spec.name);
    if (existing) return pick(existing);
    if (this.registry.getSingleMetric(spec.name)) return null;

    const entry: MetricEntry = {
      ...create(this.toMetricConfig(spec)),
      labelNames: spec.labelNames ?? [],
    };
    this.metrics.set(spec.name, entry);
    return pick(entry);
  }

  private toMetricConfig(spec: MetricSpec) {
    return {
      name: spec.name,
      help: spec.help,
      labelNames: [...(spec.labelNames ?? [])],
      registers: [this.registry],
    };
  }
}

export interface MetricSpec {
  /** Fully qualified, prefix included. */
  name: string;
  help: string;
  labelNames?: readonly string[];
}

function signatureOf(options: RuntimeOptions): string {
  return [
    options.prefix,
    options.collectDefaultMetrics ? "default" : "no-default",
    options.durationBucketsMs.join("|"),
  ].join(":");
}

/**
 * Held on `globalThis` rather than in a module variable because Next.js swaps
 * module instances on hot reload in development: a plain module-level singleton
 * would be re-created behind the sink's back and every metric would vanish on
 * the next edit.
 */
declare global {
  var virtbasePrometheusRuntime: MetricsRuntime | undefined;
}

/**
 * The runtime for this configuration, building it on first use.
 *
 * A configuration change that alters metric identity — the prefix, the bucket
 * bounds, whether runtime metrics are collected — cannot be applied to live
 * metric objects, so it replaces the runtime instead. Counters restart from
 * zero when that happens, which is a reset Prometheus already handles; the
 * alternative is a registry serving series under two different prefixes.
 */
export function getRuntime(options: RuntimeOptions): MetricsRuntime {
  const current = globalThis.virtbasePrometheusRuntime;
  if (current && current.signature === signatureOf(options)) return current;

  const runtime = new MetricsRuntime(options);
  globalThis.virtbasePrometheusRuntime = runtime;
  return runtime;
}

/** Drops the process-wide runtime. Tests only. */
export function resetRuntime(): void {
  globalThis.virtbasePrometheusRuntime = undefined;
}

/**
 * The runtime for an integration context's settings.
 *
 * Every entry point — the sink factory, the scrape endpoint and the health
 * check — goes through here, so all three are guaranteed to be looking at the
 * same registry rather than three views of one that keeps being rebuilt.
 */
export function runtimeFor(settings: PrometheusSettings): MetricsRuntime {
  return getRuntime({
    prefix: settings.prefix,
    collectDefaultMetrics: settings.collectDefaultMetrics,
    durationBucketsMs: settings.durationBucketsMs,
  });
}
