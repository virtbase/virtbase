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

import type { Integration } from "@virtbase/integration-sdk";
import { defineIntegration } from "@virtbase/integration-sdk";
import type {
  PlatformMetricsReader,
  PlatformMetricsSnapshot,
} from "@virtbase/ports";

export const READ_AT = new Date("2026-10-11T12:00:00Z");

/** A platform with something in every gauge. */
export const SNAPSHOT: PlatformMetricsSnapshot = {
  readAt: READ_AT,
  servers: { active: 5, installing: 1, suspended: 0, terminating: 2 },
  serversPerNode: [{ node: "pve1", datacenter: "fsn", total: 8 }],
  backups: { running: 1, failed: 0, completed: 3 },
  completedBackupBytes: 3_072,
  oldestUnsettledBackupAt: new Date(READ_AT.getTime() - 90_000),
  orders: { draft: 0, paid: 1, fulfilled: 4 },
  oldestInFlightOrderAt: null,
  payments: { succeeded: 4, refunded: 1 },
  paymentAmounts: [{ currency: "EUR", captured: 5_950, refunded: 1_190 }],
  users: 3,
  nodesPerDatacenter: [{ datacenter: "fsn", total: 1 }],
  allocations: { allocated: 8, released: 2 },
};

/** A `platformMetrics` port that answers `snapshots` in turn, repeating the last. */
export const createFakeReader = (
  ...snapshots: PlatformMetricsSnapshot[]
): PlatformMetricsReader & { reads: () => number } => {
  let reads = 0;
  return {
    read: async () => {
      const snapshot = snapshots[Math.min(reads, snapshots.length - 1)];
      reads++;
      if (!snapshot) throw new Error("the database is unreachable");
      return snapshot;
    },
    reads: () => reads,
  };
};

/** Core as the registry composes it, reduced to the `platformMetrics` port. */
export const fakeCore = (reader: PlatformMetricsReader): Integration =>
  defineIntegration({
    id: "core",
    name: "Virtbase",
    description: "Provides platformMetrics to the tests.",
    category: "platform",
    internal: true,
    provides: { platformMetrics: () => reader },
  });
