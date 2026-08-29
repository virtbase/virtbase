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
import { createId } from "../utils";

/**
 * Who started the clock on an account's deletion.
 *
 * Lives here rather than in `privacy.ts` because `users` is what carries it;
 * the privacy tables import it from this side to avoid a circular module.
 */
export const accountDeletionReasonEnum = d.pgEnum("account_deletion_reasons", [
  "inactivity",
  "user_request",
  "admin_request",
]);

export const users = d.snakeCase.table(
  "users",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "usr_" })),
    name: d.text().notNull(),
    email: d.text().notNull().unique(),
    emailVerified: d.boolean().default(false).notNull(),
    image: d.text(),
    createdAt: d.timestamp().defaultNow().notNull(),
    updatedAt: d.timestamp().defaultNow().notNull(),
    // Better Auth admin plugin
    banned: d.boolean().notNull().default(false),
    banReason: d.text(),
    banExpires: d.timestamp({ withTimezone: true, mode: "date" }),
    // Better Auth two-factor plugin
    twoFactorEnabled: d.boolean(),
    // Custom fields
    stripeCustomerId: d.text().unique(),
    role: d.text().notNull().default("CUSTOMER"),
    locale: d.text(),
    // Account lifecycle
    /**
     * The last authenticated interaction of any kind - a session created or
     * refreshed, an API key used.
     *
     * The input to the inactivity sweep, and the reason it is a column rather
     * than a query over `sessions`: a session only lives three days, so the
     * table cannot answer "when was this person last here" beyond that.
     *
     * @default null
     */
    lastSeenAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * Why this account is scheduled for deletion. Null when it is not.
     *
     * @default null
     */
    deletionReason: accountDeletionReasonEnum(),
    /**
     * When the seven-day reminder went out.
     *
     * Separate from {@link deletionNotifiedAt} so the sweep can tell "told
     * once, weeks ago" from "told again, recently" without arithmetic on the
     * schedule. Mirrors `servers.renewal_reminder_sent_at`.
     *
     * @default null
     */
    deletionReminderSentAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When the customer was told their account will be deleted.
     *
     * Never null while {@link deletionScheduledAt} is set - notice before
     * action is the point of the whole mechanism.
     *
     * @default null
     */
    deletionNotifiedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When the customer asked for deletion, before confirming by email.
     *
     * @default null
     */
    deletionRequestedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When the emailed confirmation token was consumed. Only now does the
     * grace period start running.
     *
     * @default null
     */
    deletionConfirmedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The moment the sweep may act. The one field every deletion cron reads,
     * whichever reason put it there.
     *
     * @default null
     */
    deletionScheduledAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When the offboarding workflow claimed this account.
     *
     * Doubles as the idempotency latch: it is set in the same transaction that
     * starts the run, so a second sweep passing over the same row finds it
     * taken rather than destroying the same servers twice.
     *
     * @default null
     */
    offboardingStartedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * Terminal. The row has been scrubbed to a tombstone and is no longer
     * personal data; it survives only so the retained financial rows keep a
     * valid foreign key.
     *
     * @default null
     */
    anonymizedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When this account was blocked from placing new orders.
     *
     * Deliberately not `banned`, which better-auth uses to refuse logins: a
     * customer who cannot log in cannot answer the abuse case that blocked
     * them, which is the opposite of what the process needs. Renewals,
     * payments and invoices stay open too - blocking a renewal ends in
     * deletion, which is a data-loss penalty applied by side effect.
     *
     * A denormalisation of `abuse_cases.blocks_ordering`, written in the same
     * transaction, and also settable by an operator with no case at all.
     *
     * @default null
     */
    orderingBlockedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /** Shown to the customer at checkout, with the case reference. */
    orderingBlockReason: d.text(),
  },
  (t) => [
    d.index().on(t.email),
    d.index().on(t.stripeCustomerId),
    // Read by the deletion sweep on every run, over a table where almost every
    // row has NULL here - so the index only carries accounts actually queued.
    d.index().on(t.deletionScheduledAt),
    d.index().on(t.lastSeenAt),
  ],
);

export const sessions = d.snakeCase.table(
  "sessions",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "sess_" })),
    expiresAt: d.timestamp().notNull(),
    token: d.text().notNull().unique(),
    createdAt: d.timestamp().defaultNow().notNull(),
    updatedAt: d
      .timestamp()
      .$onUpdate(() => sql`now()`)
      .notNull(),
    ipAddress: d.text(),
    userAgent: d.text(),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    impersonatedBy: d.text().references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  },
  (t) => [d.index().on(t.userId), d.index().on(t.token)],
);

export const accounts = d.snakeCase.table(
  "accounts",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "acc_" })),
    accountId: d.text().notNull(),
    providerId: d.text().notNull(),
    issuer: d.text().notNull(),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    accessToken: d.text(),
    refreshToken: d.text(),
    idToken: d.text(),
    accessTokenExpiresAt: d.timestamp(),
    refreshTokenExpiresAt: d.timestamp(),
    scope: d.text(),
    password: d.text(),
    createdAt: d.timestamp().defaultNow().notNull(),
    updatedAt: d
      .timestamp()
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (t) => [d.index().on(t.userId), d.uniqueIndex().on(t.issuer, t.accountId)],
);

export const verifications = d.snakeCase.table(
  "verifications",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "verif_" })),
    identifier: d.text().notNull(),
    value: d.text().notNull(),
    expiresAt: d.timestamp().notNull(),
    createdAt: d.timestamp().defaultNow().notNull(),
    updatedAt: d
      .timestamp()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (t) => [d.index().on(t.identifier)],
);

export const passkeys = d.snakeCase.table(
  "passkeys",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "passkey_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    publicKey: d.text().notNull(),
    credentialID: d.text().notNull(),
    counter: d.integer().notNull(),
    deviceType: d.text().notNull(),
    backedUp: d.boolean().notNull(),
    transports: d.text(),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    aaguid: d.text(),
  },
  (t) => [d.index().on(t.userId), d.index().on(t.credentialID)],
);

export const apiKeys = d.snakeCase.table(
  "api_keys",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "api_" })),
    name: d.text(),
    start: d.text(),
    prefix: d.text(),
    key: d.text(),
    referenceId: d.text(),
    configId: d.text().notNull().default("default"),
    refillInterval: d.integer(),
    refillAmount: d.integer(),
    lastRefillAt: d.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    enabled: d.boolean().notNull(),
    rateLimitEnabled: d.boolean().notNull(),
    rateLimitTimeWindow: d.integer(),
    rateLimitMax: d.integer(),
    requestCount: d.integer().notNull(),
    remaining: d.integer(),
    lastRequest: d.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: d.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    createdAt: d
      .timestamp({
        withTimezone: true,
        mode: "date",
      })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({
        withTimezone: true,
        mode: "date",
      })
      .$onUpdate(() => sql`now()`)
      .notNull(),
    permissions: d.text(),
    metadata: d.jsonb(),
  },
  (t) => [d.index().on(t.referenceId)],
);

export const twoFactors = d.snakeCase.table(
  "two_factors",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "tfa_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    secret: d.text().notNull(),
    backupCodes: d.text().notNull(),
    verified: d.boolean().notNull(),
    failedVerificationCount: d.integer().notNull(),
    lockedUntil: d.timestamp({
      precision: 6,
      withTimezone: true,
      mode: "date",
    }),
  },
  (t) => [d.index().on(t.userId), d.index().on(t.secret)],
);
