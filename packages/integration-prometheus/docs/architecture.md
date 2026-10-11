# Architecture

| Port | Direction | What |
| --- | --- | --- |
| `metrics` | provided | `PrometheusMetricsSink`: `increment`, `gauge` and `observe` become a counter, a gauge and a histogram |
| `platformMetrics` | consumed | core's counts of its own records, read at scrape time |

| Entry point | Holds |
| --- | --- |
| `./manifest` | the manifest, the settings and secrets schemas |
| the runtime root, `src/index.ts` | the `metrics` factory, the scrape webhook and the health probe |

## One registry per process

`MetricsRuntime` (`src/runtime.ts`) holds the prom-client registry. A counter
has to be the same object between the increment and the scrape, and
prom-client throws when a name is registered twice, so the registry cannot
live on the adapter, which the integration registry rebuilds whenever its
configuration cache expires. `getRuntime` keeps one runtime on `globalThis`
and replaces it only when the prefix, the bucket bounds or the runtime-metrics
switch change.

## A scrape

1. The integration registry mounts the scrape endpoint as a webhook, so it
   answers 404 whenever the integration is off.
2. `handleScrapeRequest` (`src/webhook.ts`) compares the bearer token in
   constant time, and answers 404 for a missing or wrong one.
3. With platform metrics on, `collectPlatformMetrics` (`src/collectors.ts`)
   resolves `platformMetrics`, reads one snapshot and writes it into the
   gauges. Core reads the snapshot in one transaction opened with
   `PLATFORM_METRICS_TRANSACTION` (`packages/api/src/platform-metrics`), so its
   counts agree with each other.
4. The registry is serialised with `cache-control: no-store`.

## Recording through the port

Dotted names become prefixed snake_case (`provisioning.duration` →
`virtbase_provisioning_duration`), and `increment` adds `_total`. One name is
used with one of the three methods: the second kind to claim a name is dropped
with a warning, because the port promises never to throw at its caller. A
metric's label set is fixed by its first sample; a later sample is projected
onto it.

[!] The port and the platform gauges share one registry. A port caller that
recorded under a platform gauge's name (`servers`, for one) with another label
set would make every later collection fail, and `platform_collector_up` would
stay at 0. `PrometheusMetricsSink` therefore drops, with a warning, every
sample whose sanitised name is one of `PLATFORM_GAUGE_SUFFIXES`
(`src/collectors.ts`), the list the gauges themselves are built from.
`MetricsRuntime` returns no metric for a name that `collectDefaultMetrics`
registered, so such a sample is dropped as well.

Samples recorded through the port live in the process that recorded them. On
a platform that runs several instances, a scrape reaches one of them, so a
counter answers "how many did this instance see since its start". Anything that
has to be exact belongs in `platformMetrics`, which every instance answers the
same.
