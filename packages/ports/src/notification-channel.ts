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

import type { FieldDescriptor } from "@virtbase/validators";

/**
 * Where a notification is going. `user` targets one customer through whichever
 * channels they have configured; `operator` targets the staff channels, or one
 * specific configured target when the dispatcher is fanning out.
 */
export type NotificationAudience =
  | { kind: "user"; userId: string }
  | { kind: "operator"; targetId?: string };

export type NotificationSeverity = "info" | "warning" | "critical";

export interface Notification {
  /** Unique per emission. The key of the delivery log row. */
  id: string;
  /**
   * Dotted key identifying what happened, e.g. `abuse.case.opened`. Channels
   * use it to look up their own rendering — the port carries no markup.
   */
  key: string;
  audience: NotificationAudience;
  severity: NotificationSeverity;
  /** Values interpolated into the channel's own template. */
  params: Record<string, string | number | boolean | null>;
  /** Optional deep link into the customer portal or admin console. */
  url?: string;
  /**
   * Groups related notifications - every event on one abuse case - so a
   * channel that can thread or replace does that instead of repeating itself.
   */
  groupKey?: string;
  /**
   * The matched target's stored configuration, already decrypted by the
   * dispatcher. A channel never reads configuration itself: an operator
   * notification may go to four Discord webhooks with different URLs, and
   * only the dispatcher knows which one this call is for.
   */
  target?: Record<string, unknown>;
  /** BCP 47 tag. The user's own where there is one, else the operator default. */
  locale?: string;
  occurredAt: Date;
}

/** What a channel reports back after a successful send. */
export interface NotificationReceipt {
  /** The channel's own id for the message, where it has one. */
  externalId?: string;
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
  /**
   * Resolves on delivery, rejects on failure.
   *
   * The dispatcher records both and lets neither reach the caller: a Discord
   * outage must not fail an abuse suspension, and an SMTP problem must not
   * roll back the transaction that opened the case.
   */
  send(notification: Notification): Promise<NotificationReceipt>;
  /**
   * Describes one configurable target of this channel, for the admin form.
   *
   * A Discord webhook needs a URL, a generic webhook needs a URL and a signing
   * secret, email needs a recipient list. Declaring them here means adding a
   * channel needs no form code, the same way adding an integration setting
   * needs none today.
   */
  readonly targetFields?: FieldDescriptor[];
  /** Keys of {@link targetFields} whose values are secret and stored encrypted. */
  readonly targetSecretKeys?: readonly string[];
}
