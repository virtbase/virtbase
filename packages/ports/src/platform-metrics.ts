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

/** A count for each value of a state, zero for the values nothing is in. */
export type CountsByState<State extends string> = Readonly<
  Record<State, number>
>;

/** A server's lifecycle, collapsed to one state per server. */
export type ServerLifecycleState =
  | "active"
  | "installing"
  | "suspended"
  | "terminating";

/** A backup's state: `running` until `reconcileServerBackup()` settles it. */
export type BackupState = "running" | "failed" | "completed";

/** Whether an IP allocation is held or has been released. */
export type AllocationState = "allocated" | "released";

/**
 * The platform's own records, counted at one instant. Every field that an
 * exporter turns into a label holds a low-cardinality value, never a user, a
 * server or an address.
 */
export interface PlatformMetricsSnapshot {
  /** When the counts were read; ages are measured from it. */
  readAt: Date;
  servers: CountsByState<ServerLifecycleState>;
  /** Servers placed on each node; a node without servers is absent. */
  serversPerNode: readonly {
    node: string;
    datacenter: string;
    total: number;
  }[];
  backups: CountsByState<BackupState>;
  /** The summed size of completed backups, in bytes. */
  completedBackupBytes: number;
  /** When the oldest backup still `running` started; null when none is. */
  oldestUnsettledBackupAt: Date | null;
  /** One entry for every order status of the core schema. */
  orders: Readonly<Record<string, number>>;
  /**
   * When the oldest order between checkout and fulfilment, as the provider
   * defines it, was created; null when none is.
   */
  oldestInFlightOrderAt: Date | null;
  /** One entry for every payment status of the core schema. */
  payments: Readonly<Record<string, number>>;
  /** Captured and refunded totals per currency, in minor units. */
  paymentAmounts: readonly {
    currency: string;
    captured: number;
    refunded: number;
  }[];
  users: number;
  /** Proxmox nodes per datacenter; a datacenter without nodes is absent. */
  nodesPerDatacenter: readonly { datacenter: string; total: number }[];
  allocations: CountsByState<AllocationState>;
}

/**
 * Read access to the platform's own counts, for a metrics exporter (ADR 0010).
 * Core provides it; an integration never reads the core tables behind it.
 */
export interface PlatformMetricsReader {
  /**
   * Reads every count from one snapshot, so the counts agree with each other.
   * Rejects when the database cannot answer.
   */
  read(): Promise<PlatformMetricsSnapshot>;
}
