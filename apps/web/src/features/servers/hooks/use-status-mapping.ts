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

import type { LucideIcon } from "@virtbase/ui/icons";
import {
  LucideCircleQuestionMark,
  LucideDownload,
  LucidePause,
  LucidePower,
  LucidePowerOff,
} from "@virtbase/ui/icons";
import { ProxmoxServerStatus } from "@virtbase/utils";
import { useExtracted } from "next-intl";

type StatusMapping = Record<
  ProxmoxServerStatus,
  {
    label: string;
    icon: LucideIcon;
    variant: "success" | "destructive" | "warning" | "outline";
  }
>;

export function useStatusMapping(): StatusMapping {
  const t = useExtracted();

  return {
    [ProxmoxServerStatus.RUNNING]: {
      label: t("Online"),
      icon: LucidePower,
      variant: "success",
    },
    [ProxmoxServerStatus.STOPPED]: {
      label: t("Offline"),
      icon: LucidePowerOff,
      variant: "destructive",
    },
    [ProxmoxServerStatus.PAUSED]: {
      label: t("Paused"),
      icon: LucidePause,
      variant: "warning",
    },
    [ProxmoxServerStatus.SUSPENDED]: {
      label: t("Suspended"),
      icon: LucideDownload,
      variant: "warning",
    },
    [ProxmoxServerStatus.UNKNOWN]: {
      label: t("Unknown"),
      icon: LucideCircleQuestionMark,
      variant: "outline",
    },
  };
}
