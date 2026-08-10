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

export const integrationHealthStatusEnum = d.pgEnum(
  "integration_health_statuses",
  ["unknown", "ok", "degraded", "error"],
);

/**
 * One row per installed integration.
 *
 * `integrationId` is the slug from `defineIntegration`, not a foreign key —
 * integrations are code, and a row may outlive the package that created it.
 * Rows for unknown slugs are simply ignored by the registry.
 */
export const integrationInstallations = d.snakeCase.table(
  "integration_installations",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "intg_" })),
    integrationId: d.text().notNull().unique(),
    enabled: d.boolean().notNull().default(false),
    /** Non-secret settings, validated against the integration's Zod schema. */
    settings: d.jsonb().notNull().default({}),
    /**
     * The per-installation data key, itself encrypted with the bootstrap
     * `CONFIG_ENCRYPTION_KEY`. Rotating the bootstrap key rewraps this column
     * and leaves every ciphertext in `integrationSecrets` untouched.
     */
    wrappedDataKey: d.text(),
    healthStatus: integrationHealthStatusEnum().notNull().default("unknown"),
    healthMessage: d.text(),
    healthCheckedAt: d.timestamp({ withTimezone: true, mode: "date" }),
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
  (t) => [d.index().on(t.enabled)],
);

/**
 * Encrypted secret values, one row per field.
 *
 * Split from the settings JSON so that reading configuration for display never
 * touches ciphertext, and so a single field can be rotated on its own.
 */
export const integrationSecrets = d.snakeCase.table(
  "integration_secrets",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "isec_" })),
    installationId: d
      .text()
      .notNull()
      .references(() => integrationInstallations.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Field key from the integration's secrets descriptor, e.g. `apiKey`. */
    key: d.text().notNull(),
    /** AES-256-GCM ciphertext, encrypted with the installation's data key. */
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
  (t) => [d.unique().on(t.installationId, t.key)],
);

export type IntegrationInstallation =
  typeof integrationInstallations.$inferSelect;
export type IntegrationSecret = typeof integrationSecrets.$inferSelect;
