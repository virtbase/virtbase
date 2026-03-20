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

import {
  ProxmoxServerStatus,
  ProxmoxTaskStatus,
  SERVER_DELETION_GRACE_PERIOD_DAYS,
} from "../constants";

/**
 * Short-hand for checking if a server is terminated
 * (terminates_at is in the past)
 */
const isTerminated = (server: {
  terminates_at: Date | null;
}): server is { terminates_at: Date } => {
  return !!server.terminates_at && server.terminates_at.getTime() < Date.now();
};

/**
 * Short-hand for checking if a server is suspended
 * (suspended_at is in the past)
 */
const isSuspended = (server: {
  suspended_at: Date | null;
}): server is { suspended_at: Date } => {
  return !!server.suspended_at && server.suspended_at.getTime() < Date.now();
};

/**
 * Short-hand for checking if a server is expiring
 * (terminates_at is in the next `withinDays` days or less, defaults to 5)
 */
const isExpiring = (
  server: {
    terminates_at: Date | null;
  },
  /**
   * The number of days to check for expiration.
   * @default 5
   */
  withinDays: number = 5,
): server is { terminates_at: Date } => {
  return (
    !!server.terminates_at &&
    Date.now() + withinDays * 24 * 60 * 60 * 1000 >
      server.terminates_at.getTime()
  );
};

/**
 * Returns the estimated date when a server will be deleted
 * if it is not renewed.
 *
 * This will add the deletion grace period to either the suspended or the termination date.
 *
 * **Should NOT be used for accurate calculations! Use database time operations instead!**
 */
const getEstimatedServerDeletionDate = (server: {
  terminates_at: Date | null;
  suspended_at?: Date | null;
}): Date | null => {
  const baseDate = server.suspended_at ?? server.terminates_at;
  if (!baseDate) {
    // Server has no termination date and does never get deleted
    return null;
  }

  const gracePeriodMillis =
    SERVER_DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

  return new Date(baseDate.getTime() + gracePeriodMillis);
};

/**
 * Short-hand for checking if a server is installing
 * (no installed_at or installed_at is in the future)
 */
const isInstalling = (server: {
  installed_at: Date | null;
}): server is { installed_at: Date } => {
  return !server.installed_at || server.installed_at.getTime() > Date.now();
};

/**
 * Short-hand for checking if a server is operational
 * (not installing, not suspended, not terminated)
 */
const isOperational = (server: {
  installed_at: Date | null;
  suspended_at: Date | null;
  terminates_at: Date | null;
}): boolean => {
  return !isInstalling(server) && !isSuspended(server) && !isTerminated(server);
};

const hasStatus = <T extends ProxmoxServerStatus>(
  server: { status: ProxmoxServerStatus | null },
  requiredStatus: T,
): server is { status: T } => {
  return server.status === requiredStatus;
};

const hasTask = <T extends ProxmoxTaskStatus>(
  server: { task: ProxmoxTaskStatus | null },
  requiredTask: T,
): server is { task: T } => {
  return server.task === requiredTask;
};

/**
 * Short-hand for checking if a server is busy
 * (no task or task is unknown)
 */
const isBusy = (server: {
  task: ProxmoxTaskStatus | null;
}): server is { task: ProxmoxTaskStatus } => {
  return server.task !== null && server.task !== ProxmoxTaskStatus.UNKNOWN;
};

/**
 * Short-hand for checking if a server can be accessed via the console
 * (not installing, not suspended, not terminated, not backing up, not restoring backup, running)
 */
const canAccessConsole = (server: {
  installed_at: Date | null;
  suspended_at: Date | null;
  terminates_at: Date | null;
  status: ProxmoxServerStatus | null;
  task: ProxmoxTaskStatus | null;
}): boolean => {
  return (
    isOperational(server) &&
    !hasTask(server, ProxmoxTaskStatus.BACKING_UP) &&
    !hasTask(server, ProxmoxTaskStatus.RESTORING_BACKUP) &&
    hasStatus(server, ProxmoxServerStatus.RUNNING)
  );
};

export {
  canAccessConsole,
  getEstimatedServerDeletionDate,
  hasStatus,
  hasTask,
  isBusy,
  isExpiring,
  isInstalling,
  isOperational,
  isSuspended,
  isTerminated,
};
