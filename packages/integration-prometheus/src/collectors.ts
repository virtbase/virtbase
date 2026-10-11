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
import type {
  PlatformMetricsReader,
  PlatformMetricsSnapshot,
} from "@virtbase/ports";
import type { Gauge } from "prom-client";
import type { MetricsRuntime } from "./runtime";

/**
 * The metrics worth putting on a dashboard: how much of the fleet exists, what
 * state it is in, and which of the pipelines that move money or data are stuck.
 *
 * Core counts all of it in Postgres at scrape time, through the
 * `platformMetrics` port (ADR 0010), rather than this process accumulating it
 * in memory: an in-process counter on serverless answers "how many servers did
 * this instance provision since its cold start", and a `count(*)` answers "how
 * many servers are there", which is the number an alert needs.
 *
 * Every label is low cardinality by construction: the `labelNames` of each
 * entry of `PLATFORM_GAUGES` take their values from the fields of
 * `PlatformMetricsSnapshot`. No metric is labelled with a user, a server or an
 * address.
 */

/**
 * Reads a snapshot from the `platformMetrics` port, which `reader` resolves,
 * and writes it into the registry, immediately before the registry is
 * serialised for a scrape.
 *
 * A failure is reported through `<prefix>platform_collector_up` and logged,
 * never thrown: a database that cannot answer leaves every platform gauge at
 * its last successful value, and the scrape still serves those values next to
 * the runtime metrics, so an alert has to watch `platform_collector_up` rather
 * than the platform gauges. Returns whether the collection succeeded, which is
 * what the gauge says; the health check reads the return value, Prometheus the
 * gauge.
 */
export const collectPlatformMetrics = async (
  runtime: MetricsRuntime,
  {
    reader,
    logger,
  }: {
    reader: () => Promise<PlatformMetricsReader>;
    logger: IntegrationLogger;
  },
): Promise<boolean> => {
  const startedAt = performance.now();
  try {
    writePlatformMetrics(runtime, await (await reader()).read());
    claimGauge(runtime, PLATFORM_GAUGES.COLLECTOR_UP)?.set(1);
    return true;
  } catch (error) {
    claimGauge(runtime, PLATFORM_GAUGES.COLLECTOR_UP)?.set(0);
    logger.error("Failed to collect platform metrics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    claimGauge(runtime, PLATFORM_GAUGES.COLLECTOR_DURATION)?.set(
      (performance.now() - startedAt) / 1_000,
    );
  }
};

/** Writes every gauge of `snapshot` into the registry. */
export const writePlatformMetrics = (
  runtime: MetricsRuntime,
  snapshot: PlatformMetricsSnapshot,
): void => {
  const gauge = (spec: GaugeSpec) => claimGauge(runtime, spec);

  setCounts(gauge(PLATFORM_GAUGES.SERVERS), "state", snapshot.servers);
  replaceSeries(
    gauge(PLATFORM_GAUGES.SERVERS_PER_NODE),
    snapshot.serversPerNode.map(({ node, datacenter, total }) => [
      { node, datacenter },
      total,
    ]),
  );
  setCounts(gauge(PLATFORM_GAUGES.BACKUPS), "state", snapshot.backups);
  gauge(PLATFORM_GAUGES.BACKUP_BYTES)?.set(snapshot.completedBackupBytes);
  gauge(PLATFORM_GAUGES.BACKUPS_STUCK)?.set(
    toAgeSeconds(snapshot.oldestUnsettledBackupAt, snapshot.readAt),
  );
  setCounts(gauge(PLATFORM_GAUGES.ORDERS), "status", snapshot.orders);
  gauge(PLATFORM_GAUGES.ORDERS_STUCK)?.set(
    toAgeSeconds(snapshot.oldestInFlightOrderAt, snapshot.readAt),
  );
  setCounts(gauge(PLATFORM_GAUGES.PAYMENTS), "status", snapshot.payments);
  replaceSeries(
    gauge(PLATFORM_GAUGES.PAYMENT_AMOUNT),
    snapshot.paymentAmounts.flatMap(({ currency, captured, refunded }) => [
      [{ kind: "captured", currency }, captured],
      [{ kind: "refunded", currency }, refunded],
    ]),
  );
  gauge(PLATFORM_GAUGES.USERS)?.set(snapshot.users);
  replaceSeries(
    gauge(PLATFORM_GAUGES.NODES),
    snapshot.nodesPerDatacenter.map(({ datacenter, total }) => [
      { datacenter },
      total,
    ]),
  );
  setCounts(gauge(PLATFORM_GAUGES.ALLOCATIONS), "state", snapshot.allocations);
};

/* -------------------------------------------------------------------------- */
/* Gauges                                                                      */
/* -------------------------------------------------------------------------- */

interface GaugeSpec {
  /** The name after the configured prefix. */
  suffix: string;
  help: string;
  labelNames?: readonly string[];
}

const PLATFORM_GAUGES = {
  SERVERS: {
    suffix: "servers",
    help: "Servers by lifecycle state.",
    labelNames: ["state"],
  },
  SERVERS_PER_NODE: {
    suffix: "servers_per_node",
    help: "Servers placed on each Proxmox node.",
    labelNames: ["node", "datacenter"],
  },
  BACKUPS: {
    suffix: "server_backups",
    help: "Server backups by state.",
    labelNames: ["state"],
  },
  BACKUP_BYTES: {
    suffix: "server_backup_bytes",
    help: "Total size of completed server backups, in bytes.",
  },
  BACKUPS_STUCK: {
    suffix: "server_backup_oldest_unsettled_seconds",
    help: "Age of the oldest backup whose vzdump task has not been reconciled. Zero when there is none.",
  },
  ORDERS: {
    suffix: "orders",
    help: "Orders by status.",
    labelNames: ["status"],
  },
  ORDERS_STUCK: {
    suffix: "order_oldest_in_flight_seconds",
    help: "Age of the oldest order in awaiting_payment, paid or fulfilling. Zero when there is none.",
  },
  PAYMENTS: {
    suffix: "payments",
    help: "Payments by status.",
    labelNames: ["status"],
  },
  PAYMENT_AMOUNT: {
    suffix: "payment_amount_minor_units",
    help: "Captured and refunded payment amounts, in the currency's smallest unit.",
    labelNames: ["kind", "currency"],
  },
  USERS: {
    suffix: "users",
    help: "Registered users.",
  },
  NODES: {
    suffix: "proxmox_nodes",
    help: "Proxmox nodes by datacenter.",
    labelNames: ["datacenter"],
  },
  ALLOCATIONS: {
    suffix: "subnet_allocations",
    help: "IP allocations by state.",
    labelNames: ["state"],
  },
  COLLECTOR_UP: {
    suffix: "platform_collector_up",
    help: "1 when the last database collection succeeded, 0 when it failed.",
  },
  COLLECTOR_DURATION: {
    suffix: "platform_collector_duration_seconds",
    help: "Wall time the last database collection took.",
  },
} as const satisfies Record<string, GaugeSpec>;

/**
 * The name, after the prefix, of every gauge this module writes.
 *
 * [!] `PrometheusMetricsSink` drops a sample recorded under one of these names:
 * a port caller that registers a platform gauge's name with another label set
 * makes every later {@link collectPlatformMetrics} fail.
 */
export const PLATFORM_GAUGE_SUFFIXES: readonly string[] = Object.values(
  PLATFORM_GAUGES,
).map((spec) => spec.suffix);

const claimGauge = (runtime: MetricsRuntime, spec: GaugeSpec) =>
  runtime.gauge({
    name: runtime.name(spec.suffix),
    help: spec.help,
    labelNames: spec.labelNames,
  });

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One series per state. The port zero-fills every state, so a panel keeps its
 * shape and an alert on `== 0` can fire: a series that disappears is not the
 * same as one that reads zero.
 */
const setCounts = (
  gauge: Gauge | null,
  label: string,
  counts: Readonly<Record<string, number>>,
): void => {
  for (const [value, total] of Object.entries(counts)) {
    gauge?.set({ [label]: value }, total);
  }
};

/**
 * Replaces every series of `gauge`. A node that has been drained, or a
 * currency no longer paid in, is absent from the snapshot, and without the
 * reset would keep its last value.
 */
const replaceSeries = (
  gauge: Gauge | null,
  series: readonly (readonly [Record<string, string>, number])[],
): void => {
  if (!gauge) return;
  gauge.reset();
  for (const [labels, value] of series) gauge.set(labels, value);
};

/** Seconds from `since` to `now`; zero when there is nothing to age. */
export const toAgeSeconds = (since: Date | null, now: Date): number =>
  since ? Math.max(0, (now.getTime() - since.getTime()) / 1_000) : 0;
