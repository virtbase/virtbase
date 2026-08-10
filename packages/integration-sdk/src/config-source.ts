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

import type { Integration } from "./types";

/**
 * Where an integration's configuration comes from.
 *
 * Today the only implementation is {@link EnvConfigSource}, which preserves
 * exactly the current behaviour: an integration is on when its environment
 * variables are present. WS1 replaces it with a Postgres-backed source without
 * any integration changing — that is the whole point of the interface.
 */
export interface ConfigSource {
  /** Whether an admin has this integration turned on. */
  isEnabled(integration: Integration): Promise<boolean>;
  /** Raw settings, validated by the registry against the declared schema. */
  settings(integration: Integration): Promise<unknown>;
  /** Raw secrets, validated by the registry against the declared schema. */
  secrets(integration: Integration): Promise<unknown>;
  /**
   * Subscribe to configuration changes so the registry can drop cached
   * adapters. Returns an unsubscribe function. Sources whose configuration
   * cannot change at runtime — the environment — may omit this.
   */
  onChange?(listener: (integrationId: string) => void): () => void;
}

/**
 * Reads configuration from `process.env` using the `env` hint each field
 * carries.
 *
 * An integration counts as enabled when every non-optional field that declares
 * an `env` name has a non-empty value, which is the same rule the current
 * module-level clients apply (`process.env.X ? new Client(...) : null`).
 */
export class EnvConfigSource implements ConfigSource {
  private readonly env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  async isEnabled(integration: Integration): Promise<boolean> {
    const required = [
      ...(integration.settings?.fields ?? []),
      ...(integration.secrets?.fields ?? []),
    ].filter((field) => field.env && !field.optional);

    // An integration that declares no environment-backed fields has nothing to
    // be missing, so it is on. Everything real declares at least one.
    return required.every((field) => Boolean(this.env[field.env as string]));
  }

  async settings(integration: Integration): Promise<unknown> {
    return this.read(integration, "settings");
  }

  async secrets(integration: Integration): Promise<unknown> {
    return this.read(integration, "secrets");
  }

  private read(
    integration: Integration,
    kind: "settings" | "secrets",
  ): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of integration[kind]?.fields ?? []) {
      if (!field.env) continue;
      const value = this.env[field.env];
      if (value !== undefined && value !== "") {
        values[field.key] = value;
      }
    }
    return values;
  }
}
