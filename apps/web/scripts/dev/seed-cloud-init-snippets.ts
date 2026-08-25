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

import { db } from "@virtbase/db/client";
import { cloudInitSnippets } from "@virtbase/db/schema";
import { BASE_SNIPPETS } from "@virtbase/utils";

/**
 * Seeds the base cloud-init snippets - the ones that replace what
 * `scripts/create-templates.sh` used to bake in with `virt-customize`.
 *
 * Idempotent by slug, and deliberately **not** destructive: an existing row is
 * left exactly as it is. Once these are editable in the admin console, a seed
 * that overwrote them would silently discard an operator's change the next time
 * anyone ran it.
 *
 * Re-seeding an edited snippet is therefore a manual act: delete the row and
 * run this again.
 *
 *   bun script dev/seed-cloud-init-snippets
 */
export async function seedCloudInitSnippets(): Promise<{
  inserted: number;
  skipped: number;
}> {
  const existing = await db
    .select({ slug: cloudInitSnippets.slug })
    .from(cloudInitSnippets);
  const known = new Set(existing.map((row) => row.slug));

  const missing = BASE_SNIPPETS.filter((snippet) => !known.has(snippet.slug));

  if (missing.length > 0) {
    await db.insert(cloudInitSnippets).values(
      missing.map((snippet) => ({
        slug: snippet.slug,
        name: titleFromSlug(snippet.slug),
        description: null,
        kind: snippet.kind,
        scope: "base" as const,
        content: snippet.content,
        // The renderer's selector type is deliberately loose - matching works
        // on strings and should not need to know the template enums. The column
        // is the stricter of the two, and these are in-repo literals.
        targets: (snippet.targets ??
          {}) as typeof cloudInitSnippets.$inferInsert.targets,
        priority: snippet.priority ?? 0,
        enabled: true,
      })),
    );
  }

  return {
    inserted: missing.length,
    skipped: BASE_SNIPPETS.length - missing.length,
  };
}

const titleFromSlug = (slug: string) =>
  slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

if (import.meta.main) {
  const { inserted, skipped } = await seedCloudInitSnippets();
  console.log(
    `cloud-init snippets: ${inserted} inserted, ${skipped} already present`,
  );
  process.exit(0);
}
