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
 * The only real implementation is `DbConfigSource` in the composition layer,
 * which reads the Postgres-backed store an administrator edits. Configuration
 * used to be read from `process.env` as well; that source is gone, because two
 * places to set the same value is one more than anyone can reason about.
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
   * cannot change at runtime may omit this.
   */
  onChange?(listener: (integrationId: string) => void): () => void;
}

/**
 * A source that reports every integration as off.
 *
 * Used when there is no `CONFIG_ENCRYPTION_KEY`, and therefore no way to read a
 * stored secret. The application still boots and serves: an unreadable
 * configuration store is a reason for integrations to be unavailable, not a
 * reason for the site to be down. The admin console shows each integration as
 * not configured, which is exactly what is true.
 */
export class DisabledConfigSource implements ConfigSource {
  async isEnabled(): Promise<boolean> {
    return false;
  }

  async settings(): Promise<unknown> {
    return {};
  }

  async secrets(): Promise<unknown> {
    return {};
  }
}
