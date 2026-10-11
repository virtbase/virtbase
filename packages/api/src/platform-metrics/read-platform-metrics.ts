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
import type { Executor } from "@virtbase/db/client";
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
import type {
  AllocationState,
  BackupState,
  PlatformMetricsSnapshot,
  ServerLifecycleState,
} from "@virtbase/ports";

/** What {@link readPlatformMetrics} needs: reads only. */
export type MetricsReader = Pick<Executor, "select">;

/**
 * One state per server. A suspended server still has a termination date, so
 * the branches are ordered by what an operator counts it as.
 */
const SERVER_STATE_SQL = sql<ServerLifecycleState>`
  case
    when ${servers.suspendedAt} is not null then 'suspended'
    when ${servers.terminatesAt} is not null then 'terminating'
    when ${servers.installedAt} is null then 'installing'
    else 'active'
  end
`;

/**
 * Mirrors `reconcileServerBackup()`: a row with neither timestamp is a vzdump
 * task still in flight, and `failed_at` means there is no archive on the node.
 */
const BACKUP_STATE_SQL = sql<BackupState>`
  case
    when ${serverBackups.failedAt} is not null then 'failed'
    when ${serverBackups.finishedAt} is null then 'running'
    else 'completed'
  end
`;

const ALLOCATION_STATE_SQL = sql<AllocationState>`
  case when ${subnetAllocations.deallocatedAt} is null
    then 'allocated' else 'released' end
`;

/**
 * Statuses an order passes through between checkout and fulfilment. An order
 * that stays in one of them has stalled, whether it waits for its payment or
 * for its server.
 */
const IN_FLIGHT_ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "fulfilling",
] as const;

interface StateCount<State extends string> {
  state: State;
  total: number;
}

/**
 * The count of `state` in `rows`, zero when `rows` lacks it: `group by`
 * returns only the states that exist, so without the zero a state whose last
 * row is deleted would disappear instead of reading 0.
 */
const readCount = <State extends string>(
  rows: readonly StateCount<State>[],
  state: State,
): number => rows.find((row) => row.state === state)?.total ?? 0;

/** A count for every value of `known`, through {@link readCount}. */
const readCounts = <State extends string>(
  known: readonly State[],
  rows: readonly StateCount<State>[],
): Readonly<Record<string, number>> =>
  Object.fromEntries(known.map((state) => [state, readCount(rows, state)]));

const readServerMetrics = async (
  tx: MetricsReader,
): Promise<Pick<PlatformMetricsSnapshot, "servers" | "serversPerNode">> => {
  const serverRows = await tx
    .select({ state: SERVER_STATE_SQL, total: count() })
    .from(servers)
    .groupBy(SERVER_STATE_SQL);
  const serversPerNode = await tx
    .select({
      node: proxmoxNodes.hostname,
      datacenter: datacenters.name,
      total: count(),
    })
    .from(servers)
    .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
    .innerJoin(datacenters, eq(proxmoxNodes.datacenterId, datacenters.id))
    .groupBy(proxmoxNodes.hostname, datacenters.name);

  return {
    servers: {
      active: readCount(serverRows, "active"),
      installing: readCount(serverRows, "installing"),
      suspended: readCount(serverRows, "suspended"),
      terminating: readCount(serverRows, "terminating"),
    },
    serversPerNode,
  };
};

const readBackupMetrics = async (
  tx: MetricsReader,
): Promise<
  Pick<
    PlatformMetricsSnapshot,
    "backups" | "completedBackupBytes" | "oldestUnsettledBackupAt"
  >
> => {
  const backupRows = await tx
    .select({
      state: BACKUP_STATE_SQL,
      total: count(),
      bytes: sum(serverBackups.size).mapWith(Number),
    })
    .from(serverBackups)
    .groupBy(BACKUP_STATE_SQL);
  const [unsettledBackup] = await tx
    .select({ oldest: min(serverBackups.startedAt) })
    .from(serverBackups)
    .where(
      and(isNull(serverBackups.finishedAt), isNull(serverBackups.failedAt)),
    );

  return {
    backups: {
      running: readCount(backupRows, "running"),
      failed: readCount(backupRows, "failed"),
      completed: readCount(backupRows, "completed"),
    },
    completedBackupBytes:
      backupRows.find((row) => row.state === "completed")?.bytes ?? 0,
    oldestUnsettledBackupAt: unsettledBackup?.oldest ?? null,
  };
};

const readOrderMetrics = async (
  tx: MetricsReader,
): Promise<
  Pick<PlatformMetricsSnapshot, "orders" | "oldestInFlightOrderAt">
> => {
  const orderRows = await tx
    .select({ state: orders.status, total: count() })
    .from(orders)
    .groupBy(orders.status);
  const [inFlightOrder] = await tx
    .select({ oldest: min(orders.createdAt) })
    .from(orders)
    .where(inArray(orders.status, IN_FLIGHT_ORDER_STATUSES));

  return {
    orders: readCounts(orderStatusEnum.enumValues, orderRows),
    oldestInFlightOrderAt: inFlightOrder?.oldest ?? null,
  };
};

const readPaymentMetrics = async (
  tx: MetricsReader,
): Promise<Pick<PlatformMetricsSnapshot, "payments" | "paymentAmounts">> => {
  const paymentRows = await tx
    .select({ state: payments.status, total: count() })
    .from(payments)
    .groupBy(payments.status);
  const paymentAmounts = await tx
    .select({
      currency: payments.currency,
      captured: sum(payments.capturedAmount).mapWith(Number),
      refunded: sum(payments.refundedAmount).mapWith(Number),
    })
    .from(payments)
    .groupBy(payments.currency);

  return {
    payments: readCounts(paymentStatusEnum.enumValues, paymentRows),
    paymentAmounts: paymentAmounts.map((row) => ({
      currency: row.currency,
      captured: row.captured ?? 0,
      refunded: row.refunded ?? 0,
    })),
  };
};

const readInventoryMetrics = async (
  tx: MetricsReader,
): Promise<
  Pick<PlatformMetricsSnapshot, "users" | "nodesPerDatacenter" | "allocations">
> => {
  const [userRow] = await tx.select({ total: count() }).from(users);
  const nodesPerDatacenter = await tx
    .select({ datacenter: datacenters.name, total: count() })
    .from(proxmoxNodes)
    .innerJoin(datacenters, eq(proxmoxNodes.datacenterId, datacenters.id))
    .groupBy(datacenters.name);
  const allocationRows = await tx
    .select({ state: ALLOCATION_STATE_SQL, total: count() })
    .from(subnetAllocations)
    .groupBy(ALLOCATION_STATE_SQL);

  return {
    users: userRow?.total ?? 0,
    nodesPerDatacenter,
    allocations: {
      allocated: readCount(allocationRows, "allocated"),
      released: readCount(allocationRows, "released"),
    },
  };
};

/**
 * Reads every count of {@link PlatformMetricsSnapshot}.
 *
 * `readPlatformMetrics` runs its queries in sequence on `tx`; the caller must
 * open `tx` with `PLATFORM_METRICS_TRANSACTION` (`./db-platform-metrics`) so
 * every query reads one snapshot.
 */
export const readPlatformMetrics = async (
  tx: MetricsReader,
  readAt: Date,
): Promise<PlatformMetricsSnapshot> => {
  const serverMetrics = await readServerMetrics(tx);
  const backupMetrics = await readBackupMetrics(tx);
  const orderMetrics = await readOrderMetrics(tx);
  const paymentMetrics = await readPaymentMetrics(tx);
  const inventoryMetrics = await readInventoryMetrics(tx);

  return {
    readAt,
    ...serverMetrics,
    ...backupMetrics,
    ...orderMetrics,
    ...paymentMetrics,
    ...inventoryMetrics,
  };
};
