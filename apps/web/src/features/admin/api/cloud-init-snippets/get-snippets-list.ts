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

import { captureException } from "@sentry/nextjs";
import { and, asc, desc, eq, getTableColumns } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { cloudInitSnippets, proxmoxTemplates } from "@virtbase/db/schema";
import { escapedIlike, getDateIntervalFilter } from "@virtbase/db/utils";
import { matchesTargets } from "@virtbase/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetCloudInitSnippetsSchema } from "../../lib/cloud-init-snippets/validations";
import { verifySession } from "../verify-session";

export async function getSnippetsList(input: GetCloudInitSnippetsSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("cloud-init-snippets", "proxmox-templates");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.name ? escapedIlike(cloudInitSnippets.name, input.name) : undefined,
      getDateIntervalFilter(cloudInitSnippets.createdAt, input.createdAt),
      getDateIntervalFilter(cloudInitSnippets.updatedAt, input.updatedAt),
    );

    // Priority then slug, matching the order the renderer composes them in, so
    // the table reads as the document that will be produced.
    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc
              ? desc(cloudInitSnippets[item.id])
              : asc(cloudInitSnippets[item.id]),
          )
        : [asc(cloudInitSnippets.priority), asc(cloudInitSnippets.slug)];

    const { snippets, templates, total } = await db.transaction(
      async (tx) => {
        const snippets = await tx
          .select(getTableColumns(cloudInitSnippets))
          .from(cloudInitSnippets)
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .orderBy(...orderBy);

        const templates = await tx
          .select({
            id: proxmoxTemplates.id,
            osFamily: proxmoxTemplates.osFamily,
            osVersion: proxmoxTemplates.osVersion,
            packageManager: proxmoxTemplates.packageManager,
            initSystem: proxmoxTemplates.initSystem,
            architecture: proxmoxTemplates.architecture,
          })
          .from(proxmoxTemplates);

        const total = await tx.$count(cloudInitSnippets, where);

        return { snippets, templates, total };
      },
      { accessMode: "read only", isolationLevel: "read committed" },
    );

    // "Matches N templates" resolved here rather than in the browser: a
    // selector mistake is far easier to see as a number that went to zero than
    // by reading the selector back.
    const data = snippets.map((snippet) => ({
      ...snippet,
      matchCount: templates.filter((template) =>
        matchesTargets(snippet.targets, template),
      ).length,
      templateCount: templates.length,
    }));

    return { data, pageCount: Math.ceil(total / input.perPage) };
  } catch (error) {
    captureException(error);

    return { data: [], pageCount: 0 };
  }
}

export async function getSnippet(id: string) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("cloud-init-snippets");

  await verifySession();

  try {
    return await db
      .select(getTableColumns(cloudInitSnippets))
      .from(cloudInitSnippets)
      .where(eq(cloudInitSnippets.id, id))
      .limit(1)
      .then(([row]) => row ?? null);
  } catch (error) {
    captureException(error);

    return null;
  }
}

/**
 * The template metadata every selector is matched against.
 *
 * Handed to the editor whole so it can recompute matches as the selector is
 * edited - the effect of a change has to be visible before saving, not at the
 * next provisioning run.
 */
export async function getSnippetTemplates() {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("cloud-init-snippets", "proxmox-templates");

  await verifySession();

  try {
    return await db
      .select({
        id: proxmoxTemplates.id,
        name: proxmoxTemplates.name,
        osFamily: proxmoxTemplates.osFamily,
        osVersion: proxmoxTemplates.osVersion,
        packageManager: proxmoxTemplates.packageManager,
        initSystem: proxmoxTemplates.initSystem,
        architecture: proxmoxTemplates.architecture,
      })
      .from(proxmoxTemplates)
      .orderBy(asc(proxmoxTemplates.name));
  } catch (error) {
    captureException(error);

    return [];
  }
}
