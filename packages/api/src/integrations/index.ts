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

import * as Sentry from "@sentry/node";
import { IntegrationConfigStore, parseMasterKey } from "@virtbase/config";
import { db } from "@virtbase/db/client";
import abuseipdb from "@virtbase/integration-abuseipdb";
import alertmanager from "@virtbase/integration-alertmanager";
import anonpay from "@virtbase/integration-anonpay";
import discord from "@virtbase/integration-discord";
import lexware from "@virtbase/integration-lexware";
import powerdns from "@virtbase/integration-powerdns";
import prometheus from "@virtbase/integration-prometheus";
import type { ConfigSource } from "@virtbase/integration-sdk";
import {
  DisabledConfigSource,
  defineIntegration,
  IntegrationRegistry,
} from "@virtbase/integration-sdk";
import stripe from "@virtbase/integration-stripe";
import webhook from "@virtbase/integration-webhook";
import { AbuseSignalIntake } from "../abuse/port";
// Imported from its own module rather than the `../notifications` barrel: the
// barrel also exports the dispatcher, which imports this file to reach the
// registry, and going through it would make the two modules circular.
import { EmailNotificationChannel } from "../notifications/channels/email";
import { createDbPlatformMetrics } from "../platform-metrics/db-platform-metrics";
import { DbConfigSource } from "./db-config-source";
import { toHttpBreadcrumb } from "./http-breadcrumb";
import { TRPCServerManagement } from "./server-management";

/**
 * Capabilities the application itself provides to integrations, exposed through
 * the same registry so a consumer cannot tell the difference.
 *
 * Always enabled, and the registry is what makes that true: an `internal`
 * integration declaring neither settings nor secrets skips the config source
 * entirely. It is hidden from the admin hub, so there is no switch to turn it
 * on and no row for the source to find.
 */
const core = defineIntegration({
  id: "core",
  name: "Virtbase",
  description: "Capabilities the application provides to its integrations.",
  category: "platform",
  internal: true,
  provides: {
    serverManagement: () => new TRPCServerManagement(),
    notifications: () => new EmailNotificationChannel(),
    signals: () => new AbuseSignalIntake(),
    platformMetrics: () => createDbPlatformMetrics({ db }),
  },
});

/**
 * The store, when a bootstrap key is available.
 *
 * Without `CONFIG_ENCRYPTION_KEY` there is no way to read a stored secret, so
 * every integration reports as off rather than the application refusing to
 * boot. That is the difference between "the configuration store is not
 * readable" and "the application is broken", and only the second deserves a
 * crash — the site still serves, and admin shows why.
 */
const createIntegrationConfigStore = (): IntegrationConfigStore | null => {
  const key = process.env.CONFIG_ENCRYPTION_KEY;
  if (key)
    return new IntegrationConfigStore({ db, masterKey: parseMasterKey(key) });

  console.warn(
    "[integrations] CONFIG_ENCRYPTION_KEY is not set. Every integration will " +
      "report as disabled until it is configured.",
  );
  return null;
};

/** The two singletons this module builds, held together on `globalThis`. */
interface IntegrationsRoot {
  integrationConfigStore: IntegrationConfigStore | null;
  integrations: IntegrationRegistry;
}

const createIntegrationsRoot = (): IntegrationsRoot => {
  const integrationConfigStore = createIntegrationConfigStore();
  const config: ConfigSource = integrationConfigStore
    ? new DbConfigSource({ store: integrationConfigStore })
    : new DisabledConfigSource();

  return {
    integrationConfigStore,
    integrations: new IntegrationRegistry({
      integrations: [
        core,
        powerdns,
        discord,
        lexware,
        stripe,
        anonpay,
        prometheus,
        webhook,
        alertmanager,
        abuseipdb,
      ],
      config,
      onHttpRequest: (event) => Sentry.addBreadcrumb(toHttpBreadcrumb(event)),
    }),
  };
};

/**
 * Next's dev server evaluates this module again on every hot reload. Held on
 * `globalThis`, the store and the registry are built, and the missing-key
 * warning is logged, once per process, as `packages/db/src/client.ts` does for
 * its pool.
 *
 * [!] The registry keeps the integration definitions it was built with, so an
 * edit to an integration package takes effect only after the dev server
 * restarts.
 */
declare global {
  var virtbaseIntegrationsRoot: IntegrationsRoot | undefined;
}

globalThis.virtbaseIntegrationsRoot ??= createIntegrationsRoot();
const root = globalThis.virtbaseIntegrationsRoot;

/**
 * The integration configuration store, or null when `CONFIG_ENCRYPTION_KEY` is
 * not set (see `createIntegrationConfigStore`).
 */
export const integrationConfigStore = root.integrationConfigStore;

/**
 * The composition root for integrations — the single place where concrete
 * adapters are bound to capability ports.
 *
 * Routers and workflows ask this registry for a capability
 * (`integrations.resolve("dns")`) and never import an integration package
 * directly. Adding an integration is one line here plus a workspace
 * dependency; nothing else in this package changes.
 */
export const integrations = root.integrations;

export { dispatchAccountLinked } from "./account-linked";
export { type DiscordBotInfo, getDiscordBotInfo } from "./discord-bot";
