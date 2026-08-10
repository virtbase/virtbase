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

/**
 * Where a notification is going. `user` targets one customer through whichever
 * channels they have configured; `operator` targets the staff channel.
 */
export type NotificationAudience =
  | { kind: "user"; userId: string }
  | { kind: "operator" };

export type NotificationSeverity = "info" | "warning" | "critical";

export interface Notification {
  /**
   * Dotted key identifying what happened, e.g. `server.provisioned`. Channels
   * use it to look up their own rendering — the port carries no markup.
   */
  key: string;
  audience: NotificationAudience;
  severity: NotificationSeverity;
  /** Values interpolated into the channel's own template. */
  params: Record<string, string | number | boolean | null>;
  /** Optional deep link into the customer portal or admin console. */
  url?: string;
}

/**
 * A way to reach a person. Email is the baseline; Discord, Telegram and
 * customer webhooks implement the same port.
 *
 * `supports` lets the notification dispatcher skip channels that cannot deliver
 * a given audience — a Discord DM is impossible for a user who never linked an
 * account — without the dispatcher knowing anything about Discord.
 */
export interface NotificationChannel {
  readonly id: string;
  supports(audience: NotificationAudience): Promise<boolean>;
  send(notification: Notification): Promise<void>;
}
