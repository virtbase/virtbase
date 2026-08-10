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
import { settings as settingsTable } from "@virtbase/db/schema";
import type * as z from "zod";
import type { ConfigDatabase } from "./types";

export interface SettingDescriptor<TSchema extends z.ZodType = z.ZodType> {
  schema: TSchema;
  /** Used when no row exists. Every setting must have one — see `get`. */
  fallback: z.output<TSchema>;
  label: string;
  help?: string;
  widget: "text" | "textarea" | "number" | "switch" | "select";
  options?: { value: string; label: string }[];
}

export type SettingRegistry = Record<string, SettingDescriptor>;

/**
 * Declares the application's settings. The same descriptor drives validation
 * here and the generated admin form, so adding a setting is one entry rather
 * than a schema change plus a form field.
 */
export const defineSettings = <T extends SettingRegistry>(registry: T): T =>
  registry;

export type SettingValue<
  TRegistry extends SettingRegistry,
  K extends keyof TRegistry,
> = z.output<TRegistry[K]["schema"]>;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Typed access to application settings, backed by the `settings` table.
 *
 * Values are cached in-process with a short TTL rather than invalidated by
 * pub/sub: the Redis client here speaks the Upstash REST API, which has no
 * subscribe. A TTL bounds how long a stale value can survive on another
 * instance, and {@link invalidate} makes the writing instance consistent
 * immediately.
 */
export class SettingsStore<TRegistry extends SettingRegistry> {
  private readonly db: ConfigDatabase;
  private readonly registry: TRegistry;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: {
    db: ConfigDatabase;
    registry: TRegistry;
    /** Defaults to 30 seconds. */
    ttlMs?: number;
  }) {
    this.db = options.db;
    this.registry = options.registry;
    this.ttlMs = options.ttlMs ?? 30_000;
  }

  /**
   * Never throws for a missing or invalid value: a setting that cannot be read
   * falls back to its declared default, because a malformed row must not be
   * able to take down a request path.
   */
  async get<K extends keyof TRegistry & string>(
    key: K,
  ): Promise<SettingValue<TRegistry, K>> {
    const descriptor = this.registry[key];
    if (!descriptor) {
      throw new Error(`Unknown setting "${key}"`);
    }

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as SettingValue<TRegistry, K>;
    }

    const row = await this.db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .limit(1)
      .then(([first]) => first);

    const parsed = row ? descriptor.schema.safeParse(row.value) : null;
    const value = parsed?.success ? parsed.data : descriptor.fallback;

    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });

    return value as SettingValue<TRegistry, K>;
  }

  async set<K extends keyof TRegistry & string>(
    key: K,
    value: SettingValue<TRegistry, K>,
  ): Promise<void> {
    const descriptor = this.registry[key];
    if (!descriptor) {
      throw new Error(`Unknown setting "${key}"`);
    }

    const parsed = descriptor.schema.parse(value);

    await this.db
      .insert(settingsTable)
      .values({ key, value: parsed })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: parsed },
      });

    this.invalidate(key);
  }

  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}
