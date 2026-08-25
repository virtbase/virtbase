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

import type { ManagedServerStatus } from "@virtbase/ports";
import { ProxmoxServerStatus } from "@virtbase/utils";

/**
 * A coloured dot per power state.
 *
 * Discord renders no colour in an embed field, so state has to be carried by a
 * glyph. These are unicode rather than uploaded emoji on purpose: they render
 * before the emoji sync has ever run, and in a DM with an app that has none.
 */
export const stateEmoji = (state: ManagedServerStatus["state"]): string => {
  switch (state) {
    case ProxmoxServerStatus.RUNNING:
      return "🟢";
    case ProxmoxServerStatus.STOPPED:
      return "⚪";
    case ProxmoxServerStatus.PAUSED:
    case ProxmoxServerStatus.SUSPENDED:
      return "🟡";
    default:
      return "⚫";
  }
};

/** `3d 4h 12m`, or `—` when the server is not running. */
export const formatUptime = (seconds: number | undefined | null): string => {
  if (!seconds || seconds <= 0) return "—";

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  return [
    days > 0 && `${days}d`,
    (days > 0 || hours > 0) && `${hours}h`,
    `${minutes}m`,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
};

/**
 * `████████░░  78%`
 *
 * A usage number alone is read as a value; a bar is read as a proportion, and
 * a proportion is what somebody glancing at a server wants. Monospace box
 * characters keep the columns aligned across rows in an embed field.
 */
export const usageBar = (used: number, total: number, width = 10): string => {
  if (!total || total <= 0 || used < 0) return "—";

  const ratio = Math.min(used / total, 1);
  const filled = Math.round(ratio * width);

  return `\`${"█".repeat(filled)}${"░".repeat(width - filled)}\` ${Math.round(ratio * 100)}%`;
};

/** A Discord timestamp, which every viewer sees in their own timezone. */
export const timestamp = (
  value: Date | string | null | undefined,
  style: "R" | "f" | "d" = "f",
): string => {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
};
