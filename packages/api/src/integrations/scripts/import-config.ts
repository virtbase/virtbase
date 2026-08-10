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

import { importIntegrationsFromEnv } from "../import-from-env";
import { integrationConfigStore, integrations } from "../index";

/**
 * One-shot importer: `bun config:import [--dry-run]`.
 *
 * Prints which settings and secrets were found by *name only* — never a value,
 * because this output tends to end up in deploy logs.
 */
const dryRun = process.argv.includes("--dry-run");

if (!integrationConfigStore) {
  console.error(
    "CONFIG_ENCRYPTION_KEY is not set, so secrets cannot be stored.\n" +
      "Generate one with: openssl rand -base64 32",
  );
  process.exit(1);
}

const results = await importIntegrationsFromEnv({
  store: integrationConfigStore,
  integrations: integrations.list(),
  dryRun,
});

console.info(
  dryRun ? "Dry run — nothing was written.\n" : "Import complete.\n",
);

for (const result of results) {
  const detail =
    result.action === "skipped-unconfigured"
      ? "nothing in the environment"
      : `enabled=${result.enabled} settings=[${result.settingKeys.join(", ")}] secrets=[${result.secretKeys.join(", ")}]`;

  console.info(
    `  ${result.integrationId.padEnd(16)} ${result.action.padEnd(22)} ${detail}`,
  );
}

process.exit(0);
