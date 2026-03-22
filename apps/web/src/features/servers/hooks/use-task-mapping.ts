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

import { ProxmoxTaskStatus } from "@virtbase/utils";
import { useExtracted } from "next-intl";

type TaskMapping = Record<
  ProxmoxTaskStatus,
  { label: string; variant: "success" | "destructive" | "warning" | "outline" }
>;

export function useTaskMapping(): TaskMapping {
  const t = useExtracted();

  return {
    [ProxmoxTaskStatus.STARTING]: {
      label: t("Starting..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.RESETTING]: {
      label: t("Resetting..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.REBOOTING]: {
      label: t("Rebooting..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.STOPPING]: {
      label: t("Stopping..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.SHUTTING_DOWN]: {
      label: t("Shutting down..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.RESUMING]: {
      label: t("Resuming..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.SUSPENDING]: {
      label: t("Suspending..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.PAUSING]: {
      label: t("Pausing..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.BACKING_UP]: {
      label: t("Backing up..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.RESTORING_BACKUP]: {
      label: t("Restoring backup..."),
      variant: "warning",
    },
    [ProxmoxTaskStatus.UNKNOWN]: {
      label: t("Unknown"),
      variant: "outline",
    },
  };
}
