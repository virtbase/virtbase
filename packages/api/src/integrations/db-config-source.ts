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
 * Reads integration configuration from Postgres.
 *
 * The single source of truth. An integration with no row is off — there is no
 * second place to look, which is the point: configuration that could come from
 * either the database or the environment meant every question about a live
 * value had two possible answers.
 */
export class DbConfigSource implements ConfigSource {
  private readonly store: IntegrationConfigStore;

  constructor(options: { store: IntegrationConfigStore }) {
    this.store = options.store;
  }

  async isEnabled(integration: Integration): Promise<boolean> {
    const installation = await this.store.find(integration.id);
    return installation?.enabled ?? false;
  }

  async settings(integration: Integration): Promise<unknown> {
    const installation = await this.store.find(integration.id);
    return installation?.settings ?? {};
  }

  async secrets(integration: Integration): Promise<unknown> {
    const installation = await this.store.find(integration.id);
    if (!installation) return {};

    return this.store.secrets(integration.id);
  }
}
