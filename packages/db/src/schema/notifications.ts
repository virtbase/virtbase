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

import { sql } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { users } from "./auth";

export const notificationAudienceEnum = d.pgEnum("notification_audiences", [
  "user",
  "operator",
]);

export const notificationSeverityEnum = d.pgEnum("notification_severities", [
  "info",
  "warning",
  "critical",
]);

export const notificationDeliveryStatusEnum = d.pgEnum(
  "notification_delivery_statuses",
  ["pending", "delivered", "skipped", "failed"],
);

/**
 * Where operator notifications go.
 *
 * A target is one configured destination on one channel - this Discord
 * webhook, that mailing list - together with what it wants to hear about.
 * Customer notifications need no rows here: they are routed by whichever
 * channels report that they can reach the person.
 */
export const notificationTargets = d.snakeCase.table(
  "notification_targets",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "ntft_" })),
    enabled: d.boolean().notNull().default(true),
    name: d.text().notNull(),
    /**
     * The channel id, as the adapter itself reports it - `email`, `discord`,
     * `webhook`.
     *
     * The adapter's own id rather than the integration id that provides it,
     * because the two need not match: `core` provides the channel called
     * `email`, and "core" is not a word an operator picking a destination
     * should have to recognise.
     *
     * Not a foreign key: channels are code, and a row may outlive the package
     * that created it. An unknown channel is skipped, the same way the
     * registry ignores an installation row for an integration nobody ships
     * any more.
     */
    channel: d.text().notNull(),
    audience: notificationAudienceEnum().notNull().default("operator"),
    /** Non-secret target configuration, e.g. a Discord channel id. */
    config: d.jsonb().notNull().default({}),
    /**
     * The per-target data key, itself encrypted with the bootstrap
     * `CONFIG_ENCRYPTION_KEY`. Same envelope scheme as
     * `integration_installations`, because a webhook URL with a token in its
     * path is exactly as sensitive as an API key.
     */
    wrappedDataKey: d.text(),
    /** Notification key globs, e.g. `["abuse.*", "node.capacity_warning"]`. */
    matchKeys: d.text().array().notNull(),
    minSeverity: notificationSeverityEnum().notNull().default("info"),
    /** Overrides the operator default for rendered text. */
    locale: d.text(),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [d.index().on(t.enabled), d.index().on(t.channel)],
);

/**
 * Encrypted target configuration, one row per field.
 *
 * Split from {@link notificationTargets.config} for the same reason
 * `integration_secrets` is split from its settings: listing targets for the
 * admin console never has to touch ciphertext, and one field can be rotated
 * on its own.
 */
export const notificationTargetSecrets = d.snakeCase.table(
  "notification_target_secrets",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "ntfs_" })),
    targetId: d
      .text()
      .notNull()
      .references(() => notificationTargets.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    key: d.text().notNull(),
    /** AES-256-GCM ciphertext, encrypted with the target's data key. */
    ciphertext: d.text().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [d.unique().on(t.targetId, t.key)],
);

/**
 * The outbox and the log.
 *
 * Written before anything is sent, so "did the customer actually get the
 * notice?" has an answer - which is the first question asked in any dispute
 * about a suspension.
 */
export const notificationDeliveries = d.snakeCase.table(
  "notification_deliveries",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "ntfd_" })),
    notificationKey: d.text().notNull(),
    /**
     * Notification key, audience and group, hashed.
     *
     * The unique constraint on it is what makes "tell them once" true across
     * instances. An in-process guard would not survive two serverless
     * invocations racing on the same case.
     */
    dedupeKey: d.text().notNull(),
    audience: notificationAudienceEnum().notNull(),
    userId: d.text().references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    targetId: d.text().references(() => notificationTargets.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Copied rather than joined, so the log still reads after a target is gone. */
    channel: d.text().notNull(),
    severity: notificationSeverityEnum().notNull(),
    /** Groups every delivery belonging to one case, e.g. `abuse:abus_...`. */
    groupKey: d.text(),
    params: d.jsonb().notNull().default({}),
    url: d.text(),
    status: notificationDeliveryStatusEnum().notNull().default("pending"),
    attempts: d.integer().notNull().default(0),
    error: d.text(),
    /** The channel's own id for the message, where it returns one. */
    externalId: d.text(),
    nextAttemptAt: d.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    deliveredAt: d.timestamp({ withTimezone: true, mode: "date" }),
  },
  (t) => [
    d.unique().on(t.dedupeKey),
    // Read by the retry cron on every run, over a table where almost every row
    // is already terminal.
    d.index().on(t.status, t.nextAttemptAt),
    d.index().on(t.groupKey),
    d.index().on(t.userId),
  ],
);

export type NotificationTarget = typeof notificationTargets.$inferSelect;
export type NotificationTargetSecret =
  typeof notificationTargetSecrets.$inferSelect;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
