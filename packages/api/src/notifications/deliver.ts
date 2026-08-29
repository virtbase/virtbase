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

import * as Sentry from "@sentry/node";
import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type { NotificationDelivery } from "@virtbase/db/schema";
import { notificationDeliveries, users } from "@virtbase/db/schema";
import { DEFAULT_EMAIL_LOCALE } from "@virtbase/email/translations";
import type { Notification, NotificationChannel } from "@virtbase/ports";
import { notificationTargetStore } from "./store";
import type { NotificationParams } from "./text";
import { renderNotification } from "./text";

/**
 * How long one channel gets before the delivery is failed and left to the
 * retry cron.
 *
 * A dispatch is awaited by whatever caused it - an abuse suspension, an order
 * failure - so an unresponsive third party must not hold that path open. The
 * retry is what makes a timeout recoverable rather than a lost message.
 */
const SEND_TIMEOUT_MS = 10_000;

/** Total attempts before a delivery is left alone. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/** Backoff per attempt already made, in minutes. */
const BACKOFF_MINUTES = [5, 15, 60, 360];

const nextAttemptAfter = (attempts: number): Date | null => {
  const minutes = BACKOFF_MINUTES[attempts - 1];
  if (undefined === minutes) return null;
  return new Date(Date.now() + minutes * 60_000);
};

const withTimeout = async <T>(
  promise: Promise<T>,
  label: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error(`${label} timed out after ${SEND_TIMEOUT_MS}ms`)),
          SEND_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// Imported at call time, not at module load. The registry provides the signal
// intake adapter, whose pipeline dispatches notifications, which lands back
// here - a static import would make the two modules circular. After the first
// call the module cache makes this free.
const findChannel = async (
  channelId: string,
): Promise<NotificationChannel | null> => {
  const { integrations } = await import("../integrations");
  const channels = await integrations.resolveAll("notifications");
  return channels.find((channel) => channel.id === channelId) ?? null;
};

/**
 * The recipient's language.
 *
 * Decided per delivery rather than per dispatch: the same case notifies the
 * customer in their own locale and an operator webhook in the team's.
 */
const resolveLocale = async (
  row: Pick<NotificationDelivery, "audience" | "userId" | "targetId">,
): Promise<string> => {
  if ("user" === row.audience && row.userId) {
    const user = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1)
      .then(([first]) => first);

    return user?.locale ?? DEFAULT_EMAIL_LOCALE;
  }

  if (row.targetId) {
    const target = await notificationTargetStore?.find(row.targetId);
    if (target?.locale) return target.locale;
  }

  return DEFAULT_EMAIL_LOCALE;
};

const markDelivered = async (id: string, externalId?: string) => {
  await db
    .update(notificationDeliveries)
    .set({
      status: "delivered",
      deliveredAt: sql`now()`,
      attempts: sql`${notificationDeliveries.attempts} + 1`,
      error: null,
      nextAttemptAt: null,
      ...(externalId ? { externalId } : {}),
    })
    .where(eq(notificationDeliveries.id, id));
};

const markFailed = async (
  row: Pick<NotificationDelivery, "id" | "attempts">,
  error: unknown,
) => {
  const attempts = row.attempts + 1;
  await db
    .update(notificationDeliveries)
    .set({
      status: "failed",
      attempts,
      error: error instanceof Error ? error.message : String(error),
      nextAttemptAt:
        attempts >= MAX_DELIVERY_ATTEMPTS ? null : nextAttemptAfter(attempts),
    })
    .where(eq(notificationDeliveries.id, row.id));
};

const markSkipped = async (id: string, reason: string) => {
  await db
    .update(notificationDeliveries)
    .set({ status: "skipped", error: reason, nextAttemptAt: null })
    .where(eq(notificationDeliveries.id, id));
};

/**
 * Sends one delivery row and records what happened.
 *
 * Never throws. A channel being down must not fail the abuse suspension that
 * caused the notification, and an SMTP problem must not roll back the
 * transaction that opened the case - the same rule the `MetricsSink` port
 * already states for measurements.
 *
 * Re-derives everything it needs from the row, which is what lets the retry
 * cron call it months later with nothing but a database id.
 */
export const deliverNotification = async (
  row: NotificationDelivery,
): Promise<"delivered" | "skipped" | "failed"> => {
  try {
    const channel = await findChannel(row.channel);
    if (!channel) {
      await markSkipped(
        row.id,
        `No enabled integration provides the "${row.channel}" notification channel.`,
      );
      return "skipped";
    }

    const locale = await resolveLocale(row);
    const params = (row.params ?? {}) as NotificationParams;
    const text = renderNotification(row.notificationKey, params, locale);

    // Secrets are merged into the config the channel sees, so a channel never
    // learns that some of its settings were encrypted and some were not.
    const target = row.targetId
      ? {
          ...((await notificationTargetStore?.find(row.targetId))?.config ??
            {}),
          ...(await notificationTargetStore?.secrets(row.targetId)),
        }
      : undefined;

    const notification: Notification = {
      id: row.id,
      key: row.notificationKey,
      audience:
        "user" === row.audience && row.userId
          ? { kind: "user", userId: row.userId }
          : {
              kind: "operator",
              ...(row.targetId ? { targetId: row.targetId } : {}),
            },
      severity: row.severity,
      params: { ...params, title: text.title, body: text.body },
      ...(row.url ? { url: row.url } : {}),
      ...(row.groupKey ? { groupKey: row.groupKey } : {}),
      ...(target ? { target } : {}),
      locale,
      occurredAt: row.createdAt,
    };

    const receipt = await withTimeout(
      channel.send(notification),
      `[notifications] ${row.channel}`,
    );

    await markDelivered(row.id, receipt?.externalId);
    return "delivered";
  } catch (error) {
    await markFailed(row, error).catch(() => {
      // The update itself failing means the database is unavailable, which the
      // caller is about to discover anyway. Losing the record is worse than
      // losing the exception.
    });
    Sentry.captureException(error, {
      tags: {
        "notifications.channel": row.channel,
        "notifications.key": row.notificationKey,
      },
    });
    return "failed";
  }
};
