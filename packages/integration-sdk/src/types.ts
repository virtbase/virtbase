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
import type { FieldDescriptor } from "@virtbase/validators";
import type * as z from "zod";

/**
 * Re-exported so integration authors keep importing form metadata from the
 * SDK. The types themselves live in `@virtbase/validators`, because
 * `@virtbase/ports` needs them as well and may not import Layer 4.
 */
export type { FieldDescriptor, FieldWidget } from "@virtbase/validators";

/**
 * Field keys for a schema, falling back to `string` when the schema type has
 * been erased.
 *
 * `Integration` widens both schemas to `z.ZodType`, whose output is `unknown`;
 * without this fallback every field key on a stored integration collapses to
 * `never` and nothing can read `field.key`.
 */
export type FieldKeyOf<TSchema extends z.ZodType> = [
  Extract<keyof z.output<TSchema>, string>,
] extends [never]
  ? string
  : Extract<keyof z.output<TSchema>, string>;

/**
 * A Zod schema plus the metadata the admin console needs to render a form for
 * it. One descriptor drives both server-side validation and the UI, so adding
 * a setting never means hand-writing a form.
 */
export interface ValueDescriptor<TSchema extends z.ZodType = z.ZodType> {
  schema: TSchema;
  fields: FieldDescriptor<FieldKeyOf<TSchema>>[];
}

/**
 * Grouping on the integrations hub. Purely presentational — nothing resolves a
 * capability by category.
 */
export type IntegrationCategory =
  | "payments"
  | "billing"
  | "infrastructure"
  | "communication"
  | "analytics"
  | "abuse"
  | "storage"
  | "platform";

export type IntegrationHealth =
  | { status: "ok"; checkedAt: Date }
  | { status: "degraded"; checkedAt: Date; message: string }
  | { status: "error"; checkedAt: Date; message: string };

/**
 * Minimal logging surface so integrations do not depend on a logger
 * implementation. Replaced by `@virtbase/observability` when it lands.
 */
export interface IntegrationLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Read access to capabilities other integrations provide.
 *
 * Integrations both fill slots and use them: Discord provides notifications and
 * an interactions webhook, but consumes `serverManagement` to answer them. This
 * is how it does that without importing the package that implements it.
 */
export interface PortAccessor {
  resolve<K extends keyof PortMap>(
    port: K,
    options?: { integrationId?: string },
  ): Promise<PortMap[K] | null>;
  require<K extends keyof PortMap>(
    port: K,
    options?: { integrationId?: string },
  ): Promise<PortMap[K]>;
}

/**
 * What an integration receives when it is asked to build an adapter. Settings
 * and secrets are already parsed against the declared schemas, so integration
 * code never validates its own configuration.
 */
export interface IntegrationContext<TSettings = unknown, TSecrets = unknown> {
  readonly id: string;
  readonly settings: TSettings;
  readonly secrets: TSecrets;
  readonly logger: IntegrationLogger;
  readonly ports: PortAccessor;
  /**
   * Keeps work alive after the response has been sent.
   *
   * Some inbound protocols require an acknowledgement far sooner than the work
   * they ask for can finish — Discord gives an interaction three seconds, which
   * does not survive a hypervisor round trip. The integration answers
   * immediately and finishes afterwards, and this is what stops the runtime
   * from tearing the process down in between.
   *
   * Supplied per request by the dispatcher, because the underlying primitive
   * (`after()` in a Next route) is only valid inside a request scope. The
   * default is fire-and-forget with the rejection logged, which is correct on a
   * long-lived server and merely unreliable on a serverless one.
   */
  readonly waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * An inbound HTTP endpoint an integration owns, mounted by the app at
 * `/api/integrations/<integration id>/<path>`.
 *
 * Webhooks are a separate slot from `provides` because they are inbound: they
 * are not a capability anything asks the registry for.
 *
 * The handler receives the untouched {@link Request}. The dispatcher must not
 * read the body first — signature verification depends on the exact bytes, and
 * verifying is the integration's job, not the route's.
 */
export interface IntegrationWebhook<TSettings = unknown, TSecrets = unknown> {
  /** Path below the integration's mount point, without leading or trailing slash. */
  path: string;
  methods: ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
  handler(
    request: Request,
    ctx: IntegrationContext<TSettings, TSecrets>,
  ): Promise<Response>;
}

/**
 * Factories for the capability slots this integration fills.
 *
 * These are factories rather than ready-made instances because configuration is
 * runtime data: when an admin rotates a key, the registry rebuilds the adapter
 * from the new context instead of the process needing a restart.
 */
export type ProvidedPorts<TSettings, TSecrets> = {
  [K in keyof PortMap]?: (
    ctx: IntegrationContext<TSettings, TSecrets>,
  ) => PortMap[K];
};

/**
 * Translated text for the admin console, keyed by field for the form labels.
 *
 * Only the strings an admin reads: `id`, port names and webhook paths are
 * identifiers and stay as they are.
 */
export interface LocalizedIntegrationText {
  name?: string;
  description?: string;
  /** Field key -> overrides. Unlisted fields keep their declared text. */
  fields?: Record<
    string,
    { label?: string; help?: string; placeholder?: string }
  >;
}

export interface IntegrationDefinition<
  TSettingsSchema extends z.ZodType = z.ZodType,
  TSecretsSchema extends z.ZodType = z.ZodType,
> {
  /** Stable slug. Used as the config key and in `/api/integrations/<id>/*`. */
  id: string;
  name: string;
  description: string;

  category: IntegrationCategory;
  /**
   * Icon key the admin console maps to a component. A string rather than a
   * component because descriptors cross the server/client boundary as data.
   */
  icon?: string;
  /** Shown as "BUILT BY" on the detail page. Defaults to Virtbase. */
  author?: string;
  /** The provider's own site, linked from the detail page. */
  website?: string;
  /** Link to setup documentation, if there is any worth reading. */
  docsUrl?: string;
  /**
   * Registered but not offered for configuration — capabilities the platform
   * provides to integrations rather than an integration itself. Hidden from
   * the hub.
   */
  internal?: boolean;

  settings?: ValueDescriptor<TSettingsSchema>;
  secrets?: ValueDescriptor<TSecretsSchema>;

  provides: ProvidedPorts<z.output<TSettingsSchema>, z.output<TSecretsSchema>>;

  /** Inbound endpoints, mounted at `/api/integrations/<id>/<path>`. */
  webhooks?: IntegrationWebhook<
    z.output<TSettingsSchema>,
    z.output<TSecretsSchema>
  >[];

  /** Run when an admin turns the integration on, e.g. register slash commands. */
  onEnable?: (
    ctx: IntegrationContext<
      z.output<TSettingsSchema>,
      z.output<TSecretsSchema>
    >,
  ) => Promise<void>;
  onDisable?: (
    ctx: IntegrationContext<
      z.output<TSettingsSchema>,
      z.output<TSecretsSchema>
    >,
  ) => Promise<void>;
  /**
   * Translated name, description and field labels for the admin console.
   *
   * It takes no translator argument and resolves its own: next-intl's extractor
   * only sees literals at a `getExtracted`/`useExtracted` call site, so the
   * strings have to be written inside the integration package — which must
   * therefore appear in `experimental.srcPath` in `apps/web/next.config.ts`.
   *
   * Requires a Next.js request context, so it is called only from the admin
   * console. `name` and `description` remain the untranslated fallbacks used in
   * logs, health output and the importer.
   */
  localize?: () => Promise<LocalizedIntegrationText>;

  /** Probed by the admin console and by the worker on a schedule. */
  health?: (
    ctx: IntegrationContext<
      z.output<TSettingsSchema>,
      z.output<TSecretsSchema>
    >,
  ) => Promise<IntegrationHealth>;
}

/**
 * An integration after {@link defineIntegration} has erased its schema generics.
 * The registry stores these; integration authors never write this type.
 */
export type Integration = IntegrationDefinition<z.ZodType, z.ZodType>;
