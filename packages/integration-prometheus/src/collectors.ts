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

import { and, count, eq, inArray, isNull, min, sql, sum } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  datacenters,
  orderStatusEnum,
  orders,
  paymentStatusEnum,
  payments,
  proxmoxNodes,
  serverBackups,
  servers,
  subnetAllocations,
  users,
} from "@virtbase/db/schema";
import type { IntegrationLogger } from "@virtbase/integration-sdk";
import type { Gauge } from "prom-client";
import type { MetricsRuntime } from "./runtime";

/**
 * The metrics worth putting on a dashboard: how much of the fleet exists, what
 * state it is in, and which of the pipelines that move money or data are stuck.
 *
 * All of it is counted in Postgres at scrape time rather than accumulated in
 * memory, which is what makes it trustworthy on a platform that runs several
 * instances and restarts them freely. An in-process counter on serverless
 * answers "how many servers did *this* instance provision since *its* cold
 * start"; a `count(*)` answers "how many servers are there", and only the
 * second is a number anyone wants to alert on.
 *
 * Everything here is low cardinality by construction — states come from enums,
 * node and datacenter names from tables that hold tens of rows. No metric is
 * ever labelled with a user, server or IP.
 */

/**
 * The lifecycle a customer sees, collapsed to one value per server.
 *
 * A server can be several of these at once in the database — a suspended server
 * still has a termination date — so the branches are ordered by what an
 * operator would want it counted as.
 */
const SERVER_STATES = [
  "active",
  "installing",
  "suspended",
  "terminating",
] as const;

const serverState = sql<string>`
  case
    when ${servers.suspendedAt} is not null then 'suspended'
    when ${servers.terminatesAt} is not null then 'terminating'
    when ${servers.installedAt} is null then 'installing'
    else 'active'
  end
`;

const BACKUP_STATES = ["running", "failed", "completed"] as const;

/**
 * Mirrors `reconcileServerBackup()`: a row with neither timestamp is a vzdump
 * task still in flight, and `failed_at` means there is no archive on the node.
 */
const backupState = sql<string>`
  case
    when ${serverBackups.failedAt} is not null then 'failed'
    when ${serverBackups.finishedAt} is null then 'running'
    else 'completed'
  end
`;

const ALLOCATION_STATES = ["allocated", "released"] as const;

const allocationState = sql<string>`
  case when ${subnetAllocations.deallocatedAt} is null
    then 'allocated' else 'released' end
`;

/**
 * Statuses an order is passing through rather than resting in. An order that
 * sits in one of these is a customer who has not got what they paid for, which
 * is what {@link ORDERS_STUCK} is there to alert on.
 */
const IN_FLIGHT_ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "fulfilling",
] as const;

/**
 * Reads every gauge's value out of the database and writes it into the
 * registry, immediately before the registry is serialised for a scrape.
 *
 * The queries run concurrently: eleven aggregates in sequence would put eleven
 * round-trips inside one scrape's timeout, and they do not depend on each
 * other. A failure is reported through `<prefix>platform_collector_up` and
 * swallowed — a database that is briefly unreachable should cost the platform
 * gauges, not the runtime metrics that are sitting in the same response and
 * would tell an operator what is wrong.
 *
 * Returns whether the collection succeeded, which is the same thing the
 * `<prefix>platform_collector_up` gauge says. The health check reads the
 * return value; Prometheus reads the gauge.
 */
export async function collectPlatformMetrics(
  runtime: MetricsRuntime,
  logger: IntegrationLogger,
): Promise<boolean> {
  const startedAt = performance.now();

  try {
    await Promise.all([
      collectServers(runtime),
      collectServersPerNode(runtime),
      collectBackups(runtime),
      collectStuckBackups(runtime),
      collectOrders(runtime),
      collectStuckOrders(runtime),
      collectPayments(runtime),
      collectPaymentAmounts(runtime),
      collectUsers(runtime),
      collectNodes(runtime),
      collectAllocations(runtime),
    ]);

    setValue(COLLECTOR_UP(runtime), {}, 1);
    return true;
  } catch (error) {
    setValue(COLLECTOR_UP(runtime), {}, 0);
    logger.error("[prometheus] Failed to collect platform metrics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    setValue(
      COLLECTOR_DURATION(runtime),
      {},
      (performance.now() - startedAt) / 1_000,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Gauges                                                                      */
/* -------------------------------------------------------------------------- */

const SERVERS = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("servers"),
    help: "Servers by lifecycle state.",
    labelNames: ["state"],
  });

const SERVERS_PER_NODE = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("servers_per_node"),
    help: "Servers placed on each Proxmox node.",
    labelNames: ["node", "datacenter"],
  });

const BACKUPS = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("server_backups"),
    help: "Server backups by state.",
    labelNames: ["state"],
  });

const BACKUP_BYTES = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("server_backup_bytes"),
    help: "Total size of completed server backups, in bytes.",
  });

const BACKUPS_STUCK = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("server_backup_oldest_unsettled_seconds"),
    help: "Age of the oldest backup whose vzdump task has not been reconciled. Zero when there is none.",
  });

const ORDERS = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("orders"),
    help: "Orders by status.",
    labelNames: ["status"],
  });

const ORDERS_STUCK = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("order_oldest_in_flight_seconds"),
    help: "Age of the oldest order that is neither fulfilled nor terminal. Zero when there is none.",
  });

const PAYMENTS = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("payments"),
    help: "Payments by status.",
    labelNames: ["status"],
  });

const PAYMENT_AMOUNT = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("payment_amount_minor_units"),
    help: "Captured and refunded payment amounts, in the currency's smallest unit.",
    labelNames: ["kind", "currency"],
  });

const USERS = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("users"),
    help: "Registered users.",
  });

const NODES = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("proxmox_nodes"),
    help: "Proxmox nodes by datacenter.",
    labelNames: ["datacenter"],
  });

const ALLOCATIONS = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("subnet_allocations"),
    help: "IP allocations by state.",
    labelNames: ["state"],
  });

const COLLECTOR_UP = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("platform_collector_up"),
    help: "1 when the last database collection succeeded, 0 when it failed.",
  });

const COLLECTOR_DURATION = (runtime: MetricsRuntime) =>
  runtime.gauge({
    name: runtime.name("platform_collector_duration_seconds"),
    help: "Wall time the last database collection took.",
  });

/* -------------------------------------------------------------------------- */
/* Collection                                                                  */
/* -------------------------------------------------------------------------- */

async function collectServers(runtime: MetricsRuntime): Promise<void> {
  const rows = await db
    .select({ state: serverState, total: count() })
    .from(servers)
    .groupBy(serverState);

  setEnumerated(SERVERS(runtime), "state", SERVER_STATES, rows, (row) => [
    row.state,
    row.total,
  ]);
}

async function collectServersPerNode(runtime: MetricsRuntime): Promise<void> {
  const rows = await db
    .select({
      node: proxmoxNodes.hostname,
      datacenter: datacenters.name,
      total: count(),
    })
    .from(servers)
    .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
    .innerJoin(datacenters, eq(proxmoxNodes.datacenterId, datacenters.id))
    .groupBy(proxmoxNodes.hostname, datacenters.name);

  const gauge = SERVERS_PER_NODE(runtime);
  if (!gauge) return;

  // A node that has been drained keeps a stale count otherwise; the reset is
  // safe because every node with servers reappears in the rows below.
  gauge.reset();
  for (const row of rows) {
    gauge.set({ node: row.node, datacenter: row.datacenter }, row.total);
  }
}

async function collectBackups(runtime: MetricsRuntime): Promise<void> {
  const rows = await db
    .select({
      state: backupState,
      total: count(),
      bytes: sum(serverBackups.size),
    })
    .from(serverBackups)
    .groupBy(backupState);

  setEnumerated(BACKUPS(runtime), "state", BACKUP_STATES, rows, (row) => [
    row.state,
    row.total,
  ]);

  const bytes = rows
    .filter((row) => row.state === "completed")
    .reduce((total, row) => total + Number(row.bytes ?? 0), 0);

  setValue(BACKUP_BYTES(runtime), {}, bytes);
}

async function collectStuckBackups(runtime: MetricsRuntime): Promise<void> {
  const [row] = await db
    .select({ oldest: min(serverBackups.startedAt) })
    .from(serverBackups)
    .where(
      and(isNull(serverBackups.finishedAt), isNull(serverBackups.failedAt)),
    );

  setValue(BACKUPS_STUCK(runtime), {}, ageInSeconds(row?.oldest));
}

async function collectOrders(runtime: MetricsRuntime): Promise<void> {
  const rows = await db
    .select({ status: orders.status, total: count() })
    .from(orders)
    .groupBy(orders.status);

  setEnumerated(
    ORDERS(runtime),
    "status",
    orderStatusEnum.enumValues,
    rows,
    (row) => [row.status, row.total],
  );
}

async function collectStuckOrders(runtime: MetricsRuntime): Promise<void> {
  const [row] = await db
    .select({ oldest: min(orders.createdAt) })
    .from(orders)
    .where(inArray(orders.status, IN_FLIGHT_ORDER_STATUSES));

  setValue(ORDERS_STUCK(runtime), {}, ageInSeconds(row?.oldest));
}

async function collectPayments(runtime: MetricsRuntime): Promise<void> {
  const rows = await db
    .select({ status: payments.status, total: count() })
    .from(payments)
    .groupBy(payments.status);

  setEnumerated(
    PAYMENTS(runtime),
    "status",
    paymentStatusEnum.enumValues,
    rows,
    (row) => [row.status, row.total],
  );
}

async function collectPaymentAmounts(runtime: MetricsRuntime): Promise<void> {
  const rows = await db
    .select({
      currency: payments.currency,
      captured: sum(payments.capturedAmount),
      refunded: sum(payments.refundedAmount),
    })
    .from(payments)
    .groupBy(payments.currency);

  const gauge = PAYMENT_AMOUNT(runtime);
  if (!gauge) return;

  gauge.reset();
  for (const row of rows) {
    gauge.set(
      { kind: "captured", currency: row.currency },
      Number(row.captured ?? 0),
    );
    gauge.set(
      { kind: "refunded", currency: row.currency },
      Number(row.refunded ?? 0),
    );
  }
}

async function collectUsers(runtime: MetricsRuntime): Promise<void> {
  const [row] = await db.select({ total: count() }).from(users);
  setValue(USERS(runtime), {}, row?.total ?? 0);
}

async function collectNodes(runtime: MetricsRuntime): Promise<void> {
  const rows = await db
    .select({ datacenter: datacenters.name, total: count() })
    .from(proxmoxNodes)
    .innerJoin(datacenters, eq(proxmoxNodes.datacenterId, datacenters.id))
    .groupBy(datacenters.name);

  const gauge = NODES(runtime);
  if (!gauge) return;

  gauge.reset();
  for (const row of rows) gauge.set({ datacenter: row.datacenter }, row.total);
}

async function collectAllocations(runtime: MetricsRuntime): Promise<void> {
  const rows = await db
    .select({ state: allocationState, total: count() })
    .from(subnetAllocations)
    .groupBy(allocationState);

  setEnumerated(
    ALLOCATIONS(runtime),
    "state",
    ALLOCATION_STATES,
    rows,
    (row) => [row.state, row.total],
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function setValue(
  gauge: Gauge | null,
  labels: Record<string, string>,
  value: number,
): void {
  gauge?.set(labels, value);
}

/**
 * Writes one series per known label value, defaulting the ones the query did
 * not return to zero.
 *
 * `group by` only returns states that currently exist, so the last failed
 * backup being deleted would otherwise leave `state="failed"` frozen at its old
 * value forever. Zero-filling from the enum also means a panel keeps its shape
 * and an alert on `== 0` can fire at all — a series that simply disappears is
 * not the same as a series that reads zero.
 */
function setEnumerated<TRow>(
  gauge: Gauge | null,
  label: string,
  known: readonly string[],
  rows: TRow[],
  read: (row: TRow) => [string, number],
): void {
  if (!gauge) return;

  const totals = new Map<string, number>(known.map((value) => [value, 0]));
  for (const row of rows) {
    const [value, total] = read(row);
    totals.set(value, total);
  }

  for (const [value, total] of totals) gauge.set({ [label]: value }, total);
}

function ageInSeconds(timestamp: Date | null | undefined): number {
  if (!timestamp) return 0;
  return Math.max(0, (Date.now() - timestamp.getTime()) / 1_000);
}
