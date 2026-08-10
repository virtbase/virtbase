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
import type { Integration } from "@virtbase/integration-sdk";
import { EnvConfigSource } from "@virtbase/integration-sdk";

export interface ImportResult {
  integrationId: string;
  action: "imported" | "skipped-existing" | "skipped-unconfigured";
  enabled: boolean;
  settingKeys: string[];
  secretKeys: string[];
}

/**
 * Seeds the configuration store from the current environment.
 *
 * Idempotent and non-destructive: an integration that already has a row is left
 * alone, so re-running after an admin has edited something cannot revert their
 * change back to whatever the environment still says.
 *
 * Run this once per environment after deploying the store. Until it runs,
 * `DbConfigSource` falls through to the environment and behaviour is unchanged.
 */
export async function importIntegrationsFromEnv(options: {
  store: IntegrationConfigStore;
  integrations: Integration[];
  env?: Record<string, string | undefined>;
  /** Report what would happen without writing. */
  dryRun?: boolean;
}): Promise<ImportResult[]> {
  const source = new EnvConfigSource(options.env ?? process.env);
  const results: ImportResult[] = [];

  for (const integration of options.integrations) {
    const existing = await options.store.find(integration.id);
    if (existing) {
      results.push({
        integrationId: integration.id,
        action: "skipped-existing",
        enabled: existing.enabled,
        settingKeys: Object.keys(existing.settings),
        secretKeys: await options.store.secretKeys(integration.id),
      });
      continue;
    }

    const enabled = await source.isEnabled(integration);
    const settings = (await source.settings(integration)) as Record<
      string,
      unknown
    >;
    const secrets = (await source.secrets(integration)) as Record<
      string,
      string
    >;

    // An integration with nothing in the environment gets no row at all, so it
    // shows up in admin as "not installed" rather than "installed but broken".
    if (
      !enabled &&
      0 === Object.keys(settings).length &&
      0 === Object.keys(secrets).length
    ) {
      results.push({
        integrationId: integration.id,
        action: "skipped-unconfigured",
        enabled: false,
        settingKeys: [],
        secretKeys: [],
      });
      continue;
    }

    if (!options.dryRun) {
      await options.store.upsert({
        integrationId: integration.id,
        enabled,
        settings,
      });
      await options.store.setSecrets(integration.id, secrets);
    }

    results.push({
      integrationId: integration.id,
      action: "imported",
      enabled,
      settingKeys: Object.keys(settings),
      secretKeys: Object.keys(secrets),
    });
  }

  return results;
}
