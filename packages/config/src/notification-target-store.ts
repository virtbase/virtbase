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
  notificationTargetSecrets,
  notificationTargets,
} from "@virtbase/db/schema";
import {
  decrypt,
  encrypt,
  generateKey,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto";
import type { ConfigDatabase } from "./types";

export type NotificationAudience = "user" | "operator";
export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationTargetRecord {
  id: string;
  enabled: boolean;
  name: string;
  /** The channel id an adapter reports, e.g. `email`, `discord`, `webhook`. */
  channel: string;
  audience: NotificationAudience;
  /** Non-secret configuration. Secrets are read separately and never listed. */
  config: Record<string, unknown>;
  matchKeys: string[];
  minSeverity: NotificationSeverity;
  locale: string | null;
}

export interface NotificationTargetInput {
  name: string;
  channel: string;
  audience?: NotificationAudience;
  enabled?: boolean;
  config?: Record<string, unknown>;
  matchKeys: string[];
  minSeverity?: NotificationSeverity;
  locale?: string | null;
}

/**
 * Where operator notifications go, and the credentials for getting there.
 *
 * The same envelope scheme as {@link IntegrationConfigStore}: a per-row data
 * key, itself wrapped with the bootstrap key, so rotating the bootstrap key
 * rewraps one short string per target and touches no ciphertext.
 *
 * A separate store rather than a second use of the integration one, because a
 * target is not an installation: there are many per channel, they are created
 * and deleted by admins, and they carry routing rules an integration has no
 * concept of.
 */
export class NotificationTargetStore {
  private readonly db: ConfigDatabase;
  private readonly masterKey: Uint8Array;

  constructor(options: { db: ConfigDatabase; masterKey: Uint8Array }) {
    this.db = options.db;
    this.masterKey = options.masterKey;
  }

  async list(): Promise<NotificationTargetRecord[]> {
    const rows = await this.db
      .select({
        id: notificationTargets.id,
        enabled: notificationTargets.enabled,
        name: notificationTargets.name,
        channel: notificationTargets.channel,
        audience: notificationTargets.audience,
        config: notificationTargets.config,
        matchKeys: notificationTargets.matchKeys,
        minSeverity: notificationTargets.minSeverity,
        locale: notificationTargets.locale,
      })
      .from(notificationTargets);

    return rows.map((row) => ({
      ...row,
      config: (row.config ?? {}) as Record<string, unknown>,
    }));
  }

  async find(id: string): Promise<NotificationTargetRecord | null> {
    const all = await this.list();
    return all.find((target) => target.id === id) ?? null;
  }

  /** Decrypted secret values. Only the dispatcher has any reason to call this. */
  async secrets(id: string): Promise<Record<string, string>> {
    const target = await this.db
      .select({ wrappedDataKey: notificationTargets.wrappedDataKey })
      .from(notificationTargets)
      .where(eq(notificationTargets.id, id))
      .limit(1)
      .then(([first]) => first);

    if (!target?.wrappedDataKey) return {};

    const rows = await this.db
      .select({
        key: notificationTargetSecrets.key,
        ciphertext: notificationTargetSecrets.ciphertext,
      })
      .from(notificationTargetSecrets)
      .where(eq(notificationTargetSecrets.targetId, id));

    if (0 === rows.length) return {};

    const dataKey = await unwrapDataKey(target.wrappedDataKey, this.masterKey);

    const entries = await Promise.all(
      rows.map(
        async (row) =>
          [row.key, await decrypt(row.ciphertext, dataKey)] as const,
      ),
    );

    return Object.fromEntries(entries);
  }

  /** Which secret fields are set, without decrypting them. Drives the admin UI. */
  async secretKeys(id: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: notificationTargetSecrets.key })
      .from(notificationTargetSecrets)
      .where(eq(notificationTargetSecrets.targetId, id));

    return rows.map((row) => row.key);
  }

  async create(input: NotificationTargetInput): Promise<string> {
    const [row] = await this.db
      .insert(notificationTargets)
      .values({
        name: input.name,
        channel: input.channel,
        audience: input.audience ?? "operator",
        enabled: input.enabled ?? true,
        config: input.config ?? {},
        matchKeys: input.matchKeys,
        minSeverity: input.minSeverity ?? "info",
        locale: input.locale ?? null,
      })
      .returning({ id: notificationTargets.id });

    if (!row) throw new Error("Failed to create notification target");
    return row.id;
  }

  async update(
    id: string,
    input: Partial<NotificationTargetInput>,
  ): Promise<void> {
    await this.db
      .update(notificationTargets)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.channel === undefined ? {} : { channel: input.channel }),
        ...(input.audience === undefined ? {} : { audience: input.audience }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.config === undefined ? {} : { config: input.config }),
        ...(input.matchKeys === undefined
          ? {}
          : { matchKeys: input.matchKeys }),
        ...(input.minSeverity === undefined
          ? {}
          : { minSeverity: input.minSeverity }),
        ...(input.locale === undefined ? {} : { locale: input.locale }),
      })
      .where(eq(notificationTargets.id, id));
  }

  /**
   * Writes secret values. A `null` deletes that field; a key absent from
   * `values` is left alone, which is what makes "blank means unchanged" work
   * in the admin form.
   */
  async setSecrets(
    id: string,
    values: Record<string, string | null>,
  ): Promise<void> {
    const target = await this.db
      .select({ wrappedDataKey: notificationTargets.wrappedDataKey })
      .from(notificationTargets)
      .where(eq(notificationTargets.id, id))
      .limit(1)
      .then(([first]) => first);

    if (!target) throw new Error(`Unknown notification target "${id}"`);

    const toDelete = Object.entries(values).filter(
      ([, value]) => null === value,
    );
    const toWrite = Object.entries(values).filter(
      (entry): entry is [string, string] => null !== entry[1],
    );

    for (const [key] of toDelete) {
      await this.db
        .delete(notificationTargetSecrets)
        .where(
          and(
            eq(notificationTargetSecrets.targetId, id),
            eq(notificationTargetSecrets.key, key),
          ),
        );
    }

    if (0 === toWrite.length) return;

    // The data key is minted on first write rather than at creation, so a
    // target that never holds a secret never carries one.
    let dataKey: Uint8Array;
    if (target.wrappedDataKey) {
      dataKey = await unwrapDataKey(target.wrappedDataKey, this.masterKey);
    } else {
      dataKey = generateKey();
      await this.db
        .update(notificationTargets)
        .set({ wrappedDataKey: await wrapDataKey(dataKey, this.masterKey) })
        .where(eq(notificationTargets.id, id));
    }

    for (const [key, value] of toWrite) {
      const ciphertext = await encrypt(value, dataKey);
      await this.db
        .insert(notificationTargetSecrets)
        .values({ targetId: id, key, ciphertext })
        .onConflictDoUpdate({
          target: [
            notificationTargetSecrets.targetId,
            notificationTargetSecrets.key,
          ],
          set: { ciphertext },
        });
    }
  }

  async remove(id: string): Promise<void> {
    await this.db
      .delete(notificationTargets)
      .where(eq(notificationTargets.id, id));
  }
}
