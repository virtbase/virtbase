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

import * as Sentry from "@sentry/node";
import { and, eq, isNull } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { serverBackups } from "@virtbase/db/schema";
import {
  BACKUP_ARCHIVE_GRACE_MINUTES,
  BACKUP_STALE_AFTER_HOURS,
} from "@virtbase/utils";
import type { ProxmoxInstance } from "../proxmox";

type Database = typeof database;

/**
 * A backup row that has not reached a terminal state yet.
 */
export interface UnsettledBackup {
  id: string;
  serverId: string;
  upid: string;
  startedAt: Date;
  failedAt: Date | null;
  finishedAt: Date | null;
}

export interface BackupReconciliation {
  startedAt: Date;
  failedAt: Date | null;
  finishedAt: Date | null;
  /**
   * Progress of the `vzdump` task in percent while it is still running,
   * `null` once the backup is settled or while the progress is unknown.
   */
  percentage: number | null;
}

export interface ReconcileServerBackupParams {
  db: Database;
  instance: ProxmoxInstance;
  /**
   * The storage the backup archive is written to,
   * see `proxmoxNodes.backupStorage`.
   */
  backupStorage: string;
  vmid: number;
  backup: UnsettledBackup;
}

/**
 * Marks a Proxmox call that failed. Reconciliation treats every Proxmox
 * failure the same way, so the reason only has to reach Sentry.
 */
const FAILED = Symbol("proxmox-call-failed");

const attempt = async <T>(
  operation: () => Promise<T>,
): Promise<T | typeof FAILED> => {
  try {
    return await operation();
  } catch (error) {
    Sentry.captureException(error);

    return FAILED;
  }
};

const minutesSince = (date: Date) => (Date.now() - date.getTime()) / 60_000;

const unchanged = (
  backup: UnsettledBackup,
  percentage: number | null = null,
): BackupReconciliation => ({
  startedAt: backup.startedAt,
  failedAt: backup.failedAt,
  finishedAt: backup.finishedAt,
  percentage,
});

const settle = async (
  db: Database,
  backup: UnsettledBackup,
  values: Partial<typeof serverBackups.$inferInsert>,
): Promise<BackupReconciliation> => {
  const where = and(
    eq(serverBackups.id, backup.id),
    // [!] Authorization: Only settle backups of the given server
    eq(serverBackups.serverId, backup.serverId),
  );

  const row = await db.transaction(
    async (tx) => {
      await tx
        .update(serverBackups)
        .set(values)
        // [!] The first terminal state wins - never overwrite a backup that
        // a concurrent reconciliation already settled.
        .where(and(where, isNull(serverBackups.finishedAt)));

      return tx
        .select({
          startedAt: serverBackups.startedAt,
          failedAt: serverBackups.failedAt,
          finishedAt: serverBackups.finishedAt,
        })
        .from(serverBackups)
        .where(where)
        .limit(1)
        .then(([row]) => row);
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  // The row is gone (the server was deleted while we were reconciling)
  return row ? { ...row, percentage: null } : unchanged(backup);
};

const markFailed = (db: Database, backup: UnsettledBackup) => {
  const now = new Date();

  return settle(db, backup, {
    finishedAt: now,
    failedAt: now,
  });
};

/**
 * Reads the progress of a running `vzdump` task from its log.
 *
 * Example line: `INFO:   3% (385.0 MiB of 10.0 GiB) in 3s, read: 128.3 MiB/s`
 */
const readProgress = async (instance: ProxmoxInstance, upid: string) => {
  const log = await attempt(() =>
    instance.node.tasks.$(upid).log.$get({
      download: false,
    }),
  );

  // Progress is cosmetic - never fail reconciliation over it
  if (log === FAILED) return null;

  // Go through the log lines in reverse order, the last percentage wins
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (!entry) continue;

    const match = entry.t.match(/INFO:\s+(\d+)%/);
    if (match?.[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
};

/**
 * Brings a single backup row in sync with the state of its Proxmox `vzdump`
 * task and, on success, with the archive on the backup storage.
 *
 * Reconciliation is deliberately total: every branch either settles the
 * backup or leaves it untouched for a later run. A backup that can no longer
 * be resolved - because the task fell out of the task index or because the
 * archive disappeared - is marked as failed once it is old enough. An
 * unsettled row blocks every further backup of that server and cannot be
 * deleted, so leaving one behind forever is worse than declaring it failed.
 *
 * Proxmox failures are reported to Sentry and swallowed: a node that is
 * briefly unreachable must not fail the caller.
 */
export async function reconcileServerBackup({
  db,
  instance,
  backupStorage,
  vmid,
  backup,
}: ReconcileServerBackupParams): Promise<BackupReconciliation> {
  if (backup.finishedAt) {
    // Already settled
    return unchanged(backup);
  }

  const isStale =
    minutesSince(backup.startedAt) >= BACKUP_STALE_AFTER_HOURS * 60;

  const task = await attempt(() =>
    instance.node.tasks.$(backup.upid).status.$get(),
  );

  if (task === FAILED) {
    // The node is unreachable, or the task has been rotated out of the task
    // index and can never be resolved again.
    return isStale ? markFailed(db, backup) : unchanged(backup);
  }

  if (task.status === "running") {
    // [!] A `vzdump` that Proxmox is still reporting as running long after the
    // staleness threshold is not making progress - it is wedged, typically on
    // storage that stopped answering. Left alone it never settles, and an
    // unsettled row is not a cosmetic problem: it blocks every further backup
    // of that server (`create` throws CONFLICT) and cannot be deleted
    // (`delete` throws BAD_REQUEST), so the customer's backup feature stays
    // dead until somebody edits the database by hand. Declaring it failed is
    // the only branch that gives them the feature back, and it is what every
    // other branch here already does at this age.
    if (isStale) {
      Sentry.captureMessage(
        `[reconcileServerBackup] Task for backup ${backup.id} is still running after ${BACKUP_STALE_AFTER_HOURS}h and is being marked as failed.`,
      );

      return markFailed(db, backup);
    }

    return unchanged(backup, await readProgress(instance, backup.upid));
  }

  if (task.status !== "stopped") {
    Sentry.captureMessage(
      `[reconcileServerBackup] Unhandled task status "${task.status}" for backup ${backup.id}.`,
    );

    return isStale ? markFailed(db, backup) : unchanged(backup);
  }

  // A `vzdump` that ends in `WARNINGS: n` - a failed guest agent freeze, for
  // instance - still writes a restorable archive, so it counts as a success.
  // The archive lookup below is the real arbiter either way: if no archive
  // carries our marker, the backup is marked as failed regardless.
  if (task.exitstatus !== "OK" && !task.exitstatus?.startsWith("WARNINGS")) {
    // Any other exit status = backup failed
    return markFailed(db, backup);
  }

  // The task succeeded. Unfortunately there is no other way to get the volid
  // currently - retrieve the full list of backups and search for it.
  const content = await attempt(() =>
    instance.node.storage.$(backupStorage).content.$get({
      vmid,
      content: "backup",
    }),
  );

  if (content === FAILED) {
    return isStale ? markFailed(db, backup) : unchanged(backup);
  }

  const entry = content.find(
    (entry) => !!entry.notes && entry.notes.includes(backup.id),
  );

  if (!entry) {
    // The task reported success but no archive carries our marker. Either the
    // archive was removed outside of Virtbase, or the storage listing has not
    // caught up yet - give it a short grace period before giving up.
    if (minutesSince(backup.startedAt) < BACKUP_ARCHIVE_GRACE_MINUTES) {
      return unchanged(backup);
    }

    Sentry.captureMessage(
      `[reconcileServerBackup] No archive found on storage "${backupStorage}" for backup ${backup.id}.`,
    );

    return markFailed(db, backup);
  }

  return settle(db, backup, {
    volid: entry.volid,
    size: entry.size,
    failedAt: null,
    // Use the native creation time if we have it for accurate display
    finishedAt: entry.ctime ? new Date(entry.ctime * 1000) : new Date(),
  });
}
