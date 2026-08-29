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

import { captureException } from "@sentry/nextjs";
import type { NotificationChannelDescription } from "@virtbase/api/notifications";
import {
  listNotificationChannels,
  notificationTargetStore,
} from "@virtbase/api/notifications";
import { verifySession } from "../verify-session";

export interface NotificationTargetListItem {
  id: string;
  name: string;
  channel: string;
  enabled: boolean;
  matchKeys: string[];
  minSeverity: "info" | "warning" | "critical";
  locale: string | null;
  config: Record<string, unknown>;
  /**
   * Which secret fields have a stored value — never the values themselves. A
   * secret that has been written is not readable through this API again.
   */
  configuredSecretKeys: string[];
  /** False when the integration providing this channel is currently off. */
  channelAvailable: boolean;
}

export interface NotificationSettings {
  targets: NotificationTargetListItem[];
  channels: NotificationChannelDescription[];
  /** Set when configuration cannot be stored at all. */
  error: string | null;
}

/**
 * Everything the notifications page renders.
 *
 * Channels come from the registry rather than a list, so a target whose
 * integration has been switched off is shown as unavailable instead of quietly
 * never delivering.
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  await verifySession();

  const channels = await listNotificationChannels();

  if (!notificationTargetStore) {
    return {
      targets: [],
      channels,
      error:
        "CONFIG_ENCRYPTION_KEY is not set, so notification targets cannot be stored.",
    };
  }

  // Bound locally: the narrowing above does not survive into the async closure
  // below, and re-checking inside it would read as if it could change.
  const store = notificationTargetStore;

  try {
    const rows = await store.list();
    const available = new Set(channels.map((channel) => channel.id));

    const targets = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name: row.name,
        channel: row.channel,
        enabled: row.enabled,
        matchKeys: row.matchKeys,
        minSeverity: row.minSeverity,
        locale: row.locale,
        config: row.config,
        configuredSecretKeys: await store.secretKeys(row.id),
        channelAvailable: available.has(row.channel),
      })),
    );

    return {
      targets: targets.sort((a, b) => a.name.localeCompare(b.name)),
      channels,
      error: null,
    };
  } catch (error) {
    captureException(error);
    return {
      targets: [],
      channels,
      error: "Notification targets could not be read.",
    };
  }
}
