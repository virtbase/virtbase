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

import { sql } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import type {
  proxmoxTemplateArchitectureEnum,
  proxmoxTemplateInitSystemEnum,
  proxmoxTemplateOsFamilyEnum,
  proxmoxTemplatePackageManagerEnum,
} from "./proxmox-templates";

export const cloudInitSnippetKindEnum = d.pgEnum("cloud_init_snippet_kind", [
  /** A cloud-config fragment, parsed as YAML and deep-merged. */
  "cloud-config",
  /** A shell script, wrapped into a single `runcmd` entry. */
  "shell",
]);

export const cloudInitSnippetScopeEnum = d.pgEnum("cloud_init_snippet_scope", [
  /** Applied to every matching template, always. */
  "base",
  /**
   * Selectable rather than automatic - reserved for the checkout-time
   * application install. Nothing consumes this yet.
   */
  "optional",
]);

/**
 * A reusable fragment of cloud-init vendor data.
 *
 * Snippets are composed per template into a single `#cloud-config` document
 * that replaces what `virt-customize` used to bake into the disk. Because they
 * are data rather than a shell script, an image-specific variant is a second
 * row with a narrower selector instead of a branch nobody can test.
 */
export const cloudInitSnippets = d.snakeCase.table(
  "cloud_init_snippets",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "snip_" })),
    /**
     * Stable handle, used in logs and as the provenance comment above the
     * fragment in the composed document.
     *
     * @example "base-sshd"
     */
    slug: d.text().notNull().unique(),
    /**
     * Human-readable name shown in the admin console.
     *
     * @example "Root SSH access"
     */
    name: d.text().notNull(),
    description: d.text(),
    kind: cloudInitSnippetKindEnum().notNull().default("cloud-config"),
    scope: cloudInitSnippetScopeEnum().notNull().default("base"),
    /**
     * The fragment itself. Validated by parsing it on save, never on the
     * provisioning path - a snippet that cannot parse must not be storable.
     */
    content: d.text().notNull(),
    /**
     * Which templates this snippet applies to, matched against the template's
     * metadata. An empty object means every template.
     *
     * Shape is owned by the renderer in `@virtbase/utils` rather than the
     * database, so adding a dimension needs no migration:
     * `{ osFamily?: string[], packageManager?: string[],
     *    initSystem?: string[], architecture?: string[],
     *    osVersionRange?: string }`
     *
     * @default {}
     */
    targets: d
      .jsonb()
      .notNull()
      // Derived from the template enums rather than restated, so a new OS
      // family cannot be selectable on a template but unmatchable by a snippet.
      .$type<{
        osFamily?: (typeof proxmoxTemplateOsFamilyEnum.enumValues)[number][];
        packageManager?: (typeof proxmoxTemplatePackageManagerEnum.enumValues)[number][];
        initSystem?: (typeof proxmoxTemplateInitSystemEnum.enumValues)[number][];
        architecture?: (typeof proxmoxTemplateArchitectureEnum.enumValues)[number][];
        osVersionRange?: string;
      }>()
      .default({}),
    /**
     * Ordering within the composed document. Lower runs first; ties are broken
     * by `slug` so the output is deterministic and diffable.
     *
     * @default 0
     */
    priority: d.smallint().notNull().default(0),
    /**
     * Lets a snippet be withdrawn fleet-wide without deleting it - and without
     * losing the record of what guests were previously given.
     *
     * @default true
     */
    enabled: d.boolean().notNull().default(true),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [d.index().on(t.scope), d.index().on(t.priority)],
);

export type DatabaseCloudInitSnippet = typeof cloudInitSnippets.$inferSelect;
