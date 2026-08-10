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

import { IntegrationConfigStore, parseMasterKey } from "@virtbase/config";
import { db } from "@virtbase/db/client";
import anonpay from "@virtbase/integration-anonpay";
import discord from "@virtbase/integration-discord";
import lexware from "@virtbase/integration-lexware";
import powerdns from "@virtbase/integration-powerdns";
import type { ConfigSource } from "@virtbase/integration-sdk";
import {
  defineIntegration,
  EnvConfigSource,
  IntegrationRegistry,
} from "@virtbase/integration-sdk";
import stripe from "@virtbase/integration-stripe";
import { DbConfigSource } from "./db-config-source";
import { TRPCServerManagement } from "./server-management";

/**
 * Capabilities the application itself provides to integrations, exposed through
 * the same registry so a consumer cannot tell the difference. Always enabled:
 * it declares no configuration, so there is nothing for it to be missing.
 */
const core = defineIntegration({
  id: "core",
  name: "Virtbase",
  description: "Capabilities the application provides to its integrations.",
  category: "platform",
  internal: true,
  provides: {
    serverManagement: () => new TRPCServerManagement(),
  },
});

const environmentConfig = new EnvConfigSource();

/**
 * The store, when a bootstrap key is available.
 *
 * Without `CONFIG_ENCRYPTION_KEY` there is no way to read stored secrets, so
 * the application falls back to environment-only configuration rather than
 * refusing to boot. That is the difference between "the config platform is not
 * provisioned yet" and "the application is broken", and only the second one
 * deserves a crash.
 */
export const integrationConfigStore = process.env.CONFIG_ENCRYPTION_KEY
  ? new IntegrationConfigStore({
      db,
      masterKey: parseMasterKey(process.env.CONFIG_ENCRYPTION_KEY),
    })
  : null;

const config: ConfigSource = integrationConfigStore
  ? new DbConfigSource({
      store: integrationConfigStore,
      // Dropped once the importer has run everywhere; see DbConfigSource.
      fallback: environmentConfig,
    })
  : environmentConfig;

/**
 * The composition root for integrations — the single place where concrete
 * adapters are bound to capability ports.
 *
 * Routers and workflows ask this registry for a capability
 * (`integrations.resolve("dns")`) and never import an integration package
 * directly. Adding an integration is one line here plus a workspace
 * dependency; nothing else in this package changes.
 */
export const integrations = new IntegrationRegistry({
  integrations: [core, powerdns, discord, lexware, stripe, anonpay],
  config,
});

export { dispatchAccountLinked } from "./account-linked";
