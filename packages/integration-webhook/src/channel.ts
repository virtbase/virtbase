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

import type {
  Notification,
  NotificationAudience,
  NotificationChannel,
  NotificationReceipt,
} from "@virtbase/ports";
import type { FieldDescriptor } from "@virtbase/validators";

/** The JSON one notification is delivered as. Stable; treat it as an API. */
export interface WebhookNotificationPayload {
  id: string;
  key: string;
  severity: Notification["severity"];
  title: string;
  body: string;
  url?: string;
  group_key?: string;
  params: Notification["params"];
  occurred_at: string;
}

const hmac = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Posts a notification as JSON to whatever URL an operator configured.
 *
 * The escape hatch. Slack, Teams, n8n, a paging service, somebody's own
 * dashboard - none of which is worth a package, and all of which can receive
 * a signed POST.
 *
 * Operator-only on purpose: a customer-facing webhook is a different feature
 * with different authorisation, and pretending one target serves both would
 * let an operator's URL receive another person's notifications.
 */
export class WebhookNotificationChannel implements NotificationChannel {
  readonly id = "webhook";

  readonly targetFields: FieldDescriptor[] = [
    {
      key: "url",
      label: "Endpoint URL",
      help: "Receives a POST with the notification as JSON.",
      widget: "url",
      placeholder: "https://example.com/hooks/virtbase",
    },
    {
      key: "signingSecret",
      label: "Signing secret",
      help: "Sent as a SHA-256 HMAC over the timestamp and body, in the X-Virtbase-Signature header. Leave blank to send unsigned.",
      widget: "password",
      optional: true,
    },
  ];

  readonly targetSecretKeys = ["signingSecret"] as const;

  async supports(audience: NotificationAudience): Promise<boolean> {
    return "operator" === audience.kind;
  }

  async send(notification: Notification): Promise<NotificationReceipt> {
    const url = notification.target?.url;
    if ("string" !== typeof url || 0 === url.length) {
      throw new Error(
        "This webhook target has no endpoint URL configured. Add one in the notification settings.",
      );
    }

    const payload: WebhookNotificationPayload = {
      id: notification.id,
      key: notification.key,
      severity: notification.severity,
      title: String(notification.params.title ?? notification.key),
      body: String(notification.params.body ?? ""),
      ...(notification.url ? { url: notification.url } : {}),
      ...(notification.groupKey ? { group_key: notification.groupKey } : {}),
      params: notification.params,
      occurred_at: notification.occurredAt.toISOString(),
    };

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = notification.target?.signingSecret;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Virtbase-Timestamp": timestamp,
        "X-Virtbase-Delivery": notification.id,
        // Signed over the timestamp as well as the body, so a captured
        // request cannot be replayed a week later against a receiver that
        // checks the age.
        ...("string" === typeof secret && secret.length > 0
          ? {
              "X-Virtbase-Signature": `sha256=${await hmac(
                secret,
                `${timestamp}.${body}`,
              )}`,
            }
          : {}),
      },
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Endpoint answered ${response.status}: ${await response
          .text()
          .catch(() => "")}`,
      );
    }

    return {};
  }
}
