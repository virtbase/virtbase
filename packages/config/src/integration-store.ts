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

import { and, eq } from "@virtbase/db";
import {
  integrationInstallations,
  integrationSecrets,
} from "@virtbase/db/schema";
import {
  decrypt,
  encrypt,
  generateKey,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto";
import type { ConfigDatabase } from "./types";

export interface Installation {
  integrationId: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface HealthRecord {
  status: "unknown" | "ok" | "degraded" | "error";
  message?: string | null;
  checkedAt: Date;
}

/**
 * Reads and writes integration configuration.
 *
 * Deliberately knows nothing about `defineIntegration` or the registry: this is
 * storage, and it lives below the integration layer so that nothing in the
 * platform has to depend upward to persist a setting.
 */
export class IntegrationConfigStore {
  private readonly db: ConfigDatabase;
  private readonly masterKey: Uint8Array;

  constructor(options: { db: ConfigDatabase; masterKey: Uint8Array }) {
    this.db = options.db;
    this.masterKey = options.masterKey;
  }

  /** `null` when the integration has never been installed. */
  async find(integrationId: string): Promise<Installation | null> {
    const row = await this.db
      .select({
        integrationId: integrationInstallations.integrationId,
        enabled: integrationInstallations.enabled,
        settings: integrationInstallations.settings,
      })
      .from(integrationInstallations)
      .where(eq(integrationInstallations.integrationId, integrationId))
      .limit(1)
      .then(([first]) => first);

    if (!row) return null;

    return {
      integrationId: row.integrationId,
      enabled: row.enabled,
      settings: (row.settings ?? {}) as Record<string, unknown>,
    };
  }

  async list(): Promise<Installation[]> {
    const rows = await this.db
      .select({
        integrationId: integrationInstallations.integrationId,
        enabled: integrationInstallations.enabled,
        settings: integrationInstallations.settings,
      })
      .from(integrationInstallations);

    return rows.map((row) => ({
      integrationId: row.integrationId,
      enabled: row.enabled,
      settings: (row.settings ?? {}) as Record<string, unknown>,
    }));
  }

  /**
   * Decrypted secret values, keyed by field. Returns `{}` for an uninstalled
   * integration so callers can treat "no secrets" and "not installed" the same.
   */
  async secrets(integrationId: string): Promise<Record<string, string>> {
    const installation = await this.db
      .select({
        id: integrationInstallations.id,
        wrappedDataKey: integrationInstallations.wrappedDataKey,
      })
      .from(integrationInstallations)
      .where(eq(integrationInstallations.integrationId, integrationId))
      .limit(1)
      .then(([first]) => first);

    if (!installation?.wrappedDataKey) return {};

    const rows = await this.db
      .select({
        key: integrationSecrets.key,
        ciphertext: integrationSecrets.ciphertext,
      })
      .from(integrationSecrets)
      .where(eq(integrationSecrets.installationId, installation.id));

    if (0 === rows.length) return {};

    const dataKey = await unwrapDataKey(
      installation.wrappedDataKey,
      this.masterKey,
    );

    const entries = await Promise.all(
      rows.map(
        async (row) =>
          [row.key, await decrypt(row.ciphertext, dataKey)] as const,
      ),
    );

    return Object.fromEntries(entries);
  }

  /** Which secret fields are set, without decrypting them. Drives the admin UI. */
  async secretKeys(integrationId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: integrationSecrets.key })
      .from(integrationSecrets)
      .innerJoin(
        integrationInstallations,
        eq(integrationSecrets.installationId, integrationInstallations.id),
      )
      .where(eq(integrationInstallations.integrationId, integrationId));

    return rows.map((row) => row.key);
  }

  async upsert(input: {
    integrationId: string;
    enabled?: boolean;
    settings?: Record<string, unknown>;
  }): Promise<void> {
    await this.db
      .insert(integrationInstallations)
      .values({
        integrationId: input.integrationId,
        enabled: input.enabled ?? false,
        settings: input.settings ?? {},
      })
      .onConflictDoUpdate({
        target: integrationInstallations.integrationId,
        set: {
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.settings === undefined ? {} : { settings: input.settings }),
        },
      });
  }

  /**
   * Stores secret values, creating the installation's data key on first write.
   * Values are replaced, never merged, so an omitted field keeps its previous
   * value rather than being blanked by an admin form that did not show it.
   */
  async setSecrets(
    integrationId: string,
    secrets: Record<string, string>,
  ): Promise<void> {
    if (0 === Object.keys(secrets).length) return;

    const installation = await this.db
      .select({
        id: integrationInstallations.id,
        wrappedDataKey: integrationInstallations.wrappedDataKey,
      })
      .from(integrationInstallations)
      .where(eq(integrationInstallations.integrationId, integrationId))
      .limit(1)
      .then(([first]) => first);

    if (!installation) {
      throw new Error(
        `Cannot store secrets for "${integrationId}": it is not installed.`,
      );
    }

    let dataKey: Uint8Array;
    if (installation.wrappedDataKey) {
      dataKey = await unwrapDataKey(
        installation.wrappedDataKey,
        this.masterKey,
      );
    } else {
      dataKey = generateKey();
      await this.db
        .update(integrationInstallations)
        .set({ wrappedDataKey: await wrapDataKey(dataKey, this.masterKey) })
        .where(eq(integrationInstallations.id, installation.id));
    }

    for (const [key, value] of Object.entries(secrets)) {
      const ciphertext = await encrypt(value, dataKey);
      await this.db
        .insert(integrationSecrets)
        .values({ installationId: installation.id, key, ciphertext })
        .onConflictDoUpdate({
          target: [integrationSecrets.installationId, integrationSecrets.key],
          set: { ciphertext },
        });
    }
  }

  async deleteSecret(integrationId: string, key: string): Promise<void> {
    const installation = await this.db
      .select({ id: integrationInstallations.id })
      .from(integrationInstallations)
      .where(eq(integrationInstallations.integrationId, integrationId))
      .limit(1)
      .then(([first]) => first);

    if (!installation) return;

    await this.db
      .delete(integrationSecrets)
      .where(
        and(
          eq(integrationSecrets.installationId, installation.id),
          eq(integrationSecrets.key, key),
        ),
      );
  }

  async recordHealth(
    integrationId: string,
    health: HealthRecord,
  ): Promise<void> {
    await this.db
      .update(integrationInstallations)
      .set({
        healthStatus: health.status,
        healthMessage: health.message ?? null,
        healthCheckedAt: health.checkedAt,
      })
      .where(eq(integrationInstallations.integrationId, integrationId));
  }
}
