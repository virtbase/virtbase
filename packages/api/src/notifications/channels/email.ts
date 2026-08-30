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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { sendBatchEmail, sendEmail } from "@virtbase/email";
import NotificationEmail from "@virtbase/email/templates/notification";
import type {
  Notification,
  NotificationAudience,
  NotificationChannel,
  NotificationReceipt,
} from "@virtbase/ports";
import type { FieldDescriptor } from "@virtbase/validators";

/**
 * One address per line, or comma separated. Operators paste from a wiki and
 * neither form should be the wrong one.
 */
const parseRecipients = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => "string" === typeof entry);
  }
  if ("string" !== typeof value) return [];

  return value
    .split(/[\n,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

/**
 * The baseline channel. Every customer has an address, so this is the one that
 * cannot be turned off for a `user` audience.
 *
 * Provided by the internal `core` integration rather than by a package of its
 * own: email is platform infrastructure that already exists, and wrapping
 * `@virtbase/email` in a plug-in would buy a boundary that describes nothing
 * true.
 */
export class EmailNotificationChannel implements NotificationChannel {
  readonly id = "email";

  readonly targetFields: FieldDescriptor[] = [
    {
      key: "recipients",
      label: "Recipients",
      help: "One address per line. Only used for operator notifications.",
      widget: "textarea",
      placeholder: "abuse@virtbase.com",
    },
  ];

  async supports(audience: NotificationAudience): Promise<boolean> {
    if ("user" === audience.kind) return true;
    // An operator target with no recipients is a misconfiguration, and the
    // dispatcher turns the resulting skip into a visible row.
    return true;
  }

  /**
   * Sends, and lets a failure out.
   *
   * Nothing here catches on purpose. `sendEmail` raises an
   * `EmailDeliveryError` when the provider refuses the message or when none is
   * configured, and `deliverNotification` turns that into a failed row with a
   * backoff that `/api/cron/retry-notifications` sweeps. Returning a receipt
   * regardless - which is what this did while `sendEmail` swallowed its own
   * errors - marked the delivery delivered and put the message beyond the
   * retry machinery entirely.
   */
  async send(notification: Notification): Promise<NotificationReceipt> {
    const title = String(notification.params.title ?? notification.key);
    const body = String(notification.params.body ?? "");

    if ("user" === notification.audience.kind) {
      const user = await db
        .select({ email: users.email, name: users.name, locale: users.locale })
        .from(users)
        .where(eq(users.id, notification.audience.userId))
        .limit(1)
        .then(([first]) => first);

      if (!user) {
        throw new Error(
          `No user "${notification.audience.userId}" to notify by email.`,
        );
      }

      await sendEmail(
        {
          to: user.email,
          //variant: "notifications",
          variant: "primary",
          subject: title,
          react: await NotificationEmail({
            email: user.email,
            name: user.name,
            title,
            body,
            ...(notification.url ? { url: notification.url } : {}),
            locale: notification.locale ?? user.locale,
          }),
        },
        // The delivery row id, so a retry cannot send the message twice.
        { idempotencyKey: notification.id },
      );

      return {};
    }

    const recipients = parseRecipients(notification.target?.recipients);
    if (0 === recipients.length) {
      throw new Error(
        "This email target has no recipients configured. Add at least one address.",
      );
    }

    // One message per address rather than one with several recipients: an
    // operator list is internal, and putting it in a `To:` header publishes it
    // to everyone on it.
    await sendBatchEmail(
      await Promise.all(
        recipients.map(async (recipient) => ({
          to: recipient,
          //variant: "notifications" as const,
          variant: "primary" as const,
          subject: title,
          replyTo: "noreply",
          react: await NotificationEmail({
            // A shared address has no person to greet and no individual
            // unsubscribe to offer.
            email: recipient,
            name: null,
            title,
            body,
            ...(notification.url ? { url: notification.url } : {}),
            locale: notification.locale,
          }),
        })),
      ),
      { idempotencyKey: notification.id },
    );

    return {};
  }
}
