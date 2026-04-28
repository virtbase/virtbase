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
import { index, pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils";

export const users = pgTable(
  "users",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "usr_" })),
    name: t.text().notNull(),
    email: t.text().notNull().unique(),
    emailVerified: t.boolean().default(false).notNull(),
    image: t.text(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t.timestamp().defaultNow().notNull(),
    // Better Auth admin plugin
    banned: t.boolean().notNull().default(false),
    banReason: t.text(),
    banExpires: t.timestamp({ withTimezone: true, mode: "date" }),
    // Custom fields
    stripeCustomerId: t.text().unique(),
    role: t.text().notNull().default("CUSTOMER"),
    locale: t.text(),
  }),
  (t) => [index().on(t.email), index().on(t.stripeCustomerId)],
);

export const sessions = pgTable(
  "sessions",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "sess_" })),
    expiresAt: t.timestamp().notNull(),
    token: t.text().notNull().unique(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp()
      .$onUpdate(() => sql`now()`)
      .notNull(),
    ipAddress: t.text(),
    userAgent: t.text(),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    impersonatedBy: t.text().references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  }),
  (t) => [index().on(t.userId), index().on(t.token)],
);

export const accounts = pgTable(
  "accounts",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "acc_" })),
    accountId: t.text().notNull(),
    providerId: t.text().notNull(),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    accessToken: t.text(),
    refreshToken: t.text(),
    idToken: t.text(),
    accessTokenExpiresAt: t.timestamp(),
    refreshTokenExpiresAt: t.timestamp(),
    scope: t.text(),
    password: t.text(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp()
      .$onUpdate(() => sql`now()`)
      .notNull(),
  }),
  (t) => [index().on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "verif_" })),
    identifier: t.text().notNull(),
    value: t.text().notNull(),
    expiresAt: t.timestamp().notNull(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
      .notNull(),
  }),
  (t) => [index().on(t.identifier)],
);

export const passkeys = pgTable(
  "passkeys",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "passkey_" })),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    publicKey: t.text().notNull(),
    credentialID: t.text().notNull(),
    counter: t.integer().notNull(),
    deviceType: t.text().notNull(),
    backedUp: t.boolean().notNull(),
    transports: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    aaguid: t.text(),
  }),
  (t) => [index().on(t.userId), index().on(t.credentialID)],
);

export const apiKeys = pgTable(
  "api_keys",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "api_" })),
    name: t.text(),
    start: t.text(),
    prefix: t.text(),
    key: t.text(),
    referenceId: t.text(),
    configId: t.text().notNull().default("default"),
    refillInterval: t.integer(),
    refillAmount: t.integer(),
    lastRefillAt: t.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    enabled: t.boolean().notNull(),
    rateLimitEnabled: t.boolean().notNull(),
    rateLimitTimeWindow: t.integer(),
    rateLimitMax: t.integer(),
    requestCount: t.integer().notNull(),
    remaining: t.integer(),
    lastRequest: t.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: t.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    createdAt: t
      .timestamp({
        withTimezone: true,
        mode: "date",
      })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({
        withTimezone: true,
        mode: "date",
      })
      .$onUpdate(() => sql`now()`)
      .notNull(),
    permissions: t.text(),
    metadata: t.jsonb(),
  }),
  (t) => [index().on(t.referenceId)],
);

export const oauthClients = pgTable(
  "oauth_clients",
  (t) => ({
    id: t.text().primaryKey(),
    clientId: t.varchar({ length: 255 }).notNull().unique(),
    clientSecret: t.text(),
    disabled: t.boolean(),
    skipConsent: t.boolean(),
    enableEndSession: t.boolean(),
    subjectType: t.text(),
    scopes: t.text().array(),
    userId: t
      .text()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    referenceId: t.text(),
    createdAt: t.timestamp({ precision: 6, withTimezone: true }),
    updatedAt: t.timestamp({ precision: 6, withTimezone: true }),
    name: t.text(),
    uri: t.text(),
    icon: t.text(),
    contacts: t.text().array(),
    tos: t.text(),
    policy: t.text(),
    softwareId: t.text(),
    softwareVersion: t.text(),
    softwareStatement: t.text(),
    redirectUris: t.text().array().notNull(),
    postLogoutRedirectUris: t.text().array(),
    tokenEndpointAuthMethod: t.text(),
    grantTypes: t.text().array(),
    responseTypes: t.text().array(),
    public: t.boolean(),
    type: t.text(),
    requirePKCE: t.boolean(),
    metadata: t.jsonb(),
  }),
  (t) => [index().on(t.userId)],
);

export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.text().notNull(),
    clientId: t
      .varchar({ length: 36 })
      .notNull()
      .references(() => oauthClients.clientId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sessionId: t.text().references(() => sessions.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    referenceId: t.text(),
    scopes: t.text().array().notNull(),
    revoked: t.timestamp({ precision: 6, withTimezone: true }),
    authTime: t.timestamp({ precision: 6, withTimezone: true }),
    createdAt: t.timestamp({ precision: 6, withTimezone: true }).notNull(),
    expiresAt: t.timestamp({ precision: 6, withTimezone: true }).notNull(),
  }),
  (t) => [
    index().on(t.clientId),
    index().on(t.sessionId),
    index().on(t.userId),
  ],
);

export const oauthConsents = pgTable(
  "oauth_consents",
  (t) => ({
    id: t.text().primaryKey(),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    clientId: t
      .varchar({ length: 36 })
      .notNull()
      .references(() => oauthClients.clientId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    referenceId: t.text(),
    scopes: t.text().array().notNull(),
    createdAt: t.timestamp({ precision: 6, withTimezone: true }).notNull(),
    updatedAt: t.timestamp({ precision: 6, withTimezone: true }).notNull(),
  }),
  (t) => [index().on(t.userId), index().on(t.clientId)],
);

export const jwkss = pgTable("jwkss", (t) => ({
  id: t.text().primaryKey(),
  publicKey: t.text().notNull(),
  privateKey: t.text().notNull(),
  createdAt: t.timestamp({ precision: 6, withTimezone: true }).notNull(),
  expiresAt: t.timestamp({ precision: 6, withTimezone: true }),
}));
