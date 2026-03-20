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

export const ProxmoxTaskStatus = {
  REBOOTING: "REBOOTING",
  STOPPING: "STOPPING",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  RESUMING: "RESUMING",
  SUSPENDING: "SUSPENDING",
  PAUSING: "PAUSING",
  BACKING_UP: "BACKING_UP",
  RESTORING_BACKUP: "RESTORING_BACKUP",
  STARTING: "STARTING",
  RESETTING: "RESETTING",
  UNKNOWN: "UNKNOWN",
} as const;

export type ProxmoxTaskStatus =
  (typeof ProxmoxTaskStatus)[keyof typeof ProxmoxTaskStatus];

export const ProxmoxServerStatus = {
  RUNNING: "RUNNING",
  STOPPED: "STOPPED",
  PAUSED: "PAUSED",
  SUSPENDED: "SUSPENDED",
  UNKNOWN: "UNKNOWN",
} as const;

export type ProxmoxServerStatus =
  (typeof ProxmoxServerStatus)[keyof typeof ProxmoxServerStatus];

export const PROXMOX_TASK_STATUS_MAPPING = {
  qmreboot: ProxmoxTaskStatus.REBOOTING,
  qmshutdown: ProxmoxTaskStatus.SHUTTING_DOWN,
  qmstop: ProxmoxTaskStatus.STOPPING,
  qmstart: ProxmoxTaskStatus.STARTING,
  qmreset: ProxmoxTaskStatus.RESETTING,
  qmresume: ProxmoxTaskStatus.RESUMING,
  qmsuspend: ProxmoxTaskStatus.SUSPENDING,
  qmpause: ProxmoxTaskStatus.PAUSING,
  vzdump: ProxmoxTaskStatus.BACKING_UP,
  vzrestore: ProxmoxTaskStatus.RESTORING_BACKUP,
} as const;
