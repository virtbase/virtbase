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

import type { PortMap } from "@virtbase/ports";
import type * as z from "zod";
import type {
  CheckedManifest,
  IntegrationManifest,
  PortName,
  ValueDescriptor,
} from "./manifest";
import type {
  Integration,
  IntegrationContext,
  IntegrationDefinition,
  IntegrationHealth,
  IntegrationWebhook,
  LocalizedIntegrationText,
} from "./types";

/** The parsed settings of a manifest; an object with no keys when it declares none. */
export type SettingsOf<M extends IntegrationManifest> =
  M["settings"] extends ValueDescriptor<infer S>
    ? z.output<S>
    : Record<never, never>;

/** The parsed secrets of a manifest; an object with no keys when it declares none. */
export type SecretsOf<M extends IntegrationManifest> =
  M["secrets"] extends ValueDescriptor<infer S>
    ? z.output<S>
    : Record<never, never>;

/** The ports a manifest says it provides. */
export type ProvidedPortsOf<M extends IntegrationManifest> =
  M["provides"] extends readonly (infer P extends PortName)[] ? P : never;

/** The context the runtime of manifest `M` receives. */
export type ContextOf<M extends IntegrationManifest> = IntegrationContext<
  SettingsOf<M>,
  SecretsOf<M>
>;

/**
 * The code half of an integration (ADR 0003, PR 1.3b). `provides` must have a
 * factory for exactly the ports the manifest lists: the type rejects a missing
 * one, and an object literal with an extra one; `findCompositionProblems`
 * rejects any mismatch at boot.
 *
 * The rest of §4.3 of integration-first.md joins with the phases that use it:
 * event `hooks`, `jobs`, `procedures`, `routes`, `privacy`, the `onInstall` and
 * `onUninstall` lifecycle hooks, and a `localize` whose result must name every
 * declared string (ADR 0018). `localize` is required already.
 */
export interface IntegrationRuntime<M extends IntegrationManifest> {
  provides: { [K in ProvidedPortsOf<M>]: (ctx: ContextOf<M>) => PortMap[K] };
  /** Inbound endpoints, mounted at `/api/integrations/<id>/<path>`. */
  webhooks?: IntegrationWebhook<SettingsOf<M>, SecretsOf<M>>[];
  /** Probed within `budgetMs`: 5000 by default, at most 15000. */
  health?: {
    budgetMs?: number;
    check(ctx: ContextOf<M>): Promise<IntegrationHealth>;
  };
  lifecycle?: {
    onEnable?(ctx: ContextOf<M>): Promise<void>;
    onDisable?(ctx: ContextOf<M>): Promise<void>;
  };
  /** Translated text for the admin console (ADR 0018). */
  localize: () => Promise<LocalizedIntegrationText>;
}

/** An integration declared with a manifest, as the registry stores it. */
export type IntegrationV2<M extends IntegrationManifest> = Integration & {
  manifest: M;
};

/**
 * Declares an integration.
 *
 * With one argument it takes a v1 definition and only infers: the settings and
 * secrets schemas stay tied to the `ctx.settings` and `ctx.secrets` types
 * inside the factories and hooks. With two, it takes a manifest and its
 * runtime, infers the same way from the manifest, and maps both into the v1
 * shape the registry stores, plus the `manifest` itself, so the registry and
 * the admin console serve v1 and v2 until PR 1.14 deletes v1.
 *
 * The registry is dynamic and stores every integration with its settings and
 * secrets types erased, which the compiler cannot express for the v2 runtime's
 * functions, hence the one assertion here (TS-2).
 *
 * ```ts
 * export default defineIntegration(manifest, {
 *   provides: { dns: (ctx) => new PowerDnsAdapter(ctx) },
 *   localize: async () => ({ name: "PowerDNS" }),
 * });
 * ```
 */
export function defineIntegration<
  TSettingsSchema extends z.ZodType,
  TSecretsSchema extends z.ZodType,
>(
  definition: IntegrationDefinition<TSettingsSchema, TSecretsSchema>,
): Integration;
export function defineIntegration<const M extends IntegrationManifest>(
  manifest: CheckedManifest<M>,
  runtime: IntegrationRuntime<M>,
): IntegrationV2<M>;
export function defineIntegration(
  first: IntegrationDefinition<z.ZodType, z.ZodType> | IntegrationManifest,
  runtime?: IntegrationRuntime<IntegrationManifest>,
): Integration {
  if (!("apiVersion" in first)) return first;
  if (!runtime) {
    throw new Error(`defineIntegration: manifest "${first.id}" has no runtime`);
  }
  const manifest = first;
  const definition = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category,
    icon: manifest.icon,
    author: manifest.author,
    website: manifest.links?.website,
    docsUrl: manifest.links?.providerDocs,
    internal: manifest.internal,
    settings: manifest.settings,
    secrets: manifest.secrets,
    provides: runtime.provides,
    webhooks: runtime.webhooks,
    onEnable: runtime.lifecycle?.onEnable,
    onDisable: runtime.lifecycle?.onDisable,
    localize: runtime.localize,
    health: runtime.health?.check,
    healthBudgetMs: runtime.health?.budgetMs,
    httpTimeoutMs: manifest.http?.timeoutMs,
    manifest,
  };
  return definition as unknown as Integration;
}
