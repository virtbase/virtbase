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

/**
 * `@virtbase/integration-sdk/manifest`: the static half of an integration
 * (ADR 0003). It must stay importable by the proxy and the feature resolver
 * without loading runtime code, so this module imports only zod, port types
 * and validators, and an integration's `./manifest` entry imports only those,
 * `@virtbase/utils` and this module. `bun check:boundaries` enforces it for
 * workspace imports, and `manifest-imports.test.ts` for every import.
 */

import type { FormDescriptor, PortMap } from "@virtbase/ports";
import type { FieldDescriptor } from "@virtbase/validators";
import * as z from "zod";

/** The SDK contract this package implements, checked against `requires.apiVersion`. */
export const SDK_API_VERSION = "2.0.0";

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
export interface ValueDescriptor<TSchema extends z.ZodType = z.ZodType>
  extends FormDescriptor {
  schema: TSchema;
  fields: FieldDescriptor<FieldKeyOf<TSchema>>[];
}

/**
 * Grouping on the integrations hub. Purely presentational — nothing resolves a
 * capability by category.
 */
/** Every category on the integrations hub. */
export const INTEGRATION_CATEGORIES = [
  "payments",
  "billing",
  "infrastructure",
  "communication",
  "analytics",
  "abuse",
  "storage",
  "platform",
] as const;

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

/** A capability an integration can provide: a key of `PortMap`. */
export type PortName = keyof PortMap;

/**
 * Everything about an integration that is known without running it: identity,
 * links, the ports it provides, and its configuration (ADR 0003, PR 1.3b).
 *
 * The rest of §4.2 of integration-first.md joins with the phases that use it:
 * `multiInstance` (ADR 0002), `requires.features` and `requires.ports`,
 * `settings.migrations`, `features`, `events`, `data`, `hooks`, `pages` and
 * `jobs`.
 */
export interface IntegrationManifest {
  apiVersion: 2;
  /** A slug, `[a-z][a-z0-9-]*`; the config key and the webhook mount point. */
  id: string;
  version: `${number}.${number}.${number}`;
  /** Untranslated fallback for logs and health output; `localize()` translates it. */
  name: string;
  description: string;
  category: IntegrationCategory;
  /** A key `apps/web` maps to an icon component. */
  icon?: string;
  /** Shown as "BUILT BY" on the detail page; Virtbase when absent. */
  author?: string;
  links?: { website?: string; providerDocs?: string; support?: string };
  /** The integration's documentation folder; it must be `./docs`. */
  docs: "./docs";
  /** A capability of the platform rather than a plug-in; hidden from the hub. */
  internal?: boolean;
  /** The range of SDK contracts it supports, such as `^2.0.0`. */
  requires?: { apiVersion?: string };
  /** The ports it provides; the runtime holds their factories. */
  provides?: readonly PortName[];
  settings?: ValueDescriptor;
  secrets?: ValueDescriptor;
  /** Replaces `ctx.http`'s 10 s default timeout, at most 30 s. */
  http?: { timeoutMs?: number };
}

/** A descriptor whose field keys are checked against its own schema. */
type CheckedDescriptor<D> = D extends { schema: infer S extends z.ZodType }
  ? ValueDescriptor<S>
  : D;

/**
 * `M`, with the field keys of its settings and secrets checked against their
 * schemas, so a field naming a key the schema lacks fails to compile.
 */
export type CheckedManifest<M extends IntegrationManifest> = M & {
  settings?: CheckedDescriptor<M["settings"]>;
  secrets?: CheckedDescriptor<M["secrets"]>;
};

/**
 * Declares a manifest. It keeps the literal types, so `provides` and the
 * schemas stay exact for `defineIntegration(manifest, runtime)`, and checks
 * each field key against its schema ({@link CheckedManifest}).
 */
export const defineManifest = <const M extends IntegrationManifest>(
  manifest: CheckedManifest<M>,
): M => manifest;

const SEMVER = /^\d+\.\d+\.\d+$/;

const ValueDescriptorSchema = z.object({
  schema: z.custom<z.ZodType>((value) => value instanceof z.ZodType, {
    message: "must be a Zod schema",
  }),
  fields: z.array(
    z.custom<FieldDescriptor>(
      (value) => typeof value === "object" && value !== null,
    ),
  ),
});

/**
 * What every manifest must satisfy at run time, beyond its type: the
 * composition root parses each manifest with it before registering it.
 */
export const IntegrationManifestSchema = z
  .object({
    apiVersion: z.literal(2),
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "must be a lowercase slug"),
    version: z.string().regex(SEMVER, "must be major.minor.patch"),
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(INTEGRATION_CATEGORIES),
    icon: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    links: z
      .object({
        website: z.url().optional(),
        providerDocs: z.url().optional(),
        support: z.url().optional(),
      })
      .optional(),
    docs: z.literal("./docs"),
    internal: z.boolean().optional(),
    requires: z
      .object({
        apiVersion: z.string().min(1).optional(),
      })
      .optional(),
    provides: z.array(z.string()).optional(),
    settings: ValueDescriptorSchema.optional(),
    secrets: ValueDescriptorSchema.optional(),
    http: z
      .object({ timeoutMs: z.number().int().positive().max(30_000).optional() })
      .optional(),
  })
  .strict();
