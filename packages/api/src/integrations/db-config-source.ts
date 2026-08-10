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

import type { IntegrationConfigStore } from "@virtbase/config";
import type { ConfigSource, Integration } from "@virtbase/integration-sdk";

/**
 * Reads integration configuration from Postgres, falling back to the
 * environment for integrations that have no row yet.
 *
 * The fallback is what makes the cutover safe: deploying this before running
 * the importer changes nothing, because every integration still resolves
 * exactly the values it resolved before. Once the importer has run and the
 * store is authoritative, the fallback can be dropped along with the `env`
 * hints on the field descriptors.
 *
 * Note the granularity: an integration is served *entirely* from the store or
 * *entirely* from the environment, never half of each. Mixing the two would
 * produce a configuration that exists in neither place, which is not something
 * anyone could debug.
 */
export class DbConfigSource implements ConfigSource {
  private readonly store: IntegrationConfigStore;
  private readonly fallback: ConfigSource | null;

  constructor(options: {
    store: IntegrationConfigStore;
    fallback?: ConfigSource;
  }) {
    this.store = options.store;
    this.fallback = options.fallback ?? null;
  }

  async isEnabled(integration: Integration): Promise<boolean> {
    const installation = await this.store.find(integration.id);
    if (installation) return installation.enabled;

    return (await this.fallback?.isEnabled(integration)) ?? false;
  }

  async settings(integration: Integration): Promise<unknown> {
    const installation = await this.store.find(integration.id);
    if (installation) return installation.settings;

    return (await this.fallback?.settings(integration)) ?? {};
  }

  async secrets(integration: Integration): Promise<unknown> {
    const installation = await this.store.find(integration.id);
    if (installation) return this.store.secrets(integration.id);

    return (await this.fallback?.secrets(integration)) ?? {};
  }
}
