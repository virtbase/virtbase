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

import { and, eq } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import {
  cloudInitSnippets,
  proxmoxTemplates,
  templateSnippets,
} from "@virtbase/db/schema";
import type {
  RenderableSnippet,
  RenderVendorDataResult,
} from "@virtbase/utils";
import { renderVendorData } from "@virtbase/utils";

type Database = typeof database;

export interface RenderTemplateVendorDataParams {
  db: Database;
  proxmoxTemplateId: string;
  /**
   * Extra snippets composed alongside the stored ones - the seam the
   * checkout-time application install will use. Ordered by the same priority
   * rule as everything else.
   */
  additionalSnippets?: RenderableSnippet[];
}

/**
 * Composes the cloud-init vendor data for one template, reading the snippet
 * repository and the template's own metadata.
 *
 * The pure composition lives in `@virtbase/utils`; this is only the query that
 * feeds it, so the admin console can render an identical preview without going
 * through a workflow.
 *
 * Returns `content: null` when nothing applies, which the caller must treat as
 * "upload no vendor-data file" rather than "upload an empty one" - an empty
 * `#cloud-config` is not the same as no vendor data to cloud-init.
 */
export async function renderTemplateVendorData({
  db,
  proxmoxTemplateId,
  additionalSnippets = [],
}: RenderTemplateVendorDataParams): Promise<
  RenderVendorDataResult & { templateName: string | null }
> {
  const { template, snippets } = await db.transaction(
    async (tx) => {
      const template = await tx
        .select({
          name: proxmoxTemplates.name,
          osFamily: proxmoxTemplates.osFamily,
          osVersion: proxmoxTemplates.osVersion,
          packageManager: proxmoxTemplates.packageManager,
          initSystem: proxmoxTemplates.initSystem,
          architecture: proxmoxTemplates.architecture,
        })
        .from(proxmoxTemplates)
        .where(eq(proxmoxTemplates.id, proxmoxTemplateId))
        .limit(1)
        .then(([row]) => row);

      // Left-joined rather than filtered: a snippet with no override row still
      // participates, decided by its selector.
      const snippets = await tx
        .select({
          slug: cloudInitSnippets.slug,
          kind: cloudInitSnippets.kind,
          content: cloudInitSnippets.content,
          targets: cloudInitSnippets.targets,
          priority: cloudInitSnippets.priority,
          enabled: cloudInitSnippets.enabled,
          attached: templateSnippets.attached,
          priorityOverride: templateSnippets.priority,
        })
        .from(cloudInitSnippets)
        .leftJoin(
          templateSnippets,
          and(
            eq(templateSnippets.cloudInitSnippetId, cloudInitSnippets.id),
            eq(templateSnippets.proxmoxTemplateId, proxmoxTemplateId),
          ),
        )
        // Only the always-on snippets for now. `optional` is reserved for the
        // checkout-time application install, which selects them explicitly.
        .where(eq(cloudInitSnippets.scope, "base"));

      return { template, snippets };
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  const renderable: RenderableSnippet[] = [
    ...snippets.map((row) => ({
      slug: row.slug,
      kind: row.kind,
      content: row.content,
      targets: row.targets,
      priority: row.priority,
      enabled: row.enabled,
      // `null` from the left join means "no override" and must stay undefined,
      // because `false` is a meaningful value here.
      ...(row.attached === null ? {} : { attached: row.attached }),
      priorityOverride: row.priorityOverride,
    })),
    ...additionalSnippets,
  ];

  const result = renderVendorData({
    snippets: renderable,
    context: {
      osFamily: template?.osFamily,
      osVersion: template?.osVersion,
      packageManager: template?.packageManager,
      initSystem: template?.initSystem,
      architecture: template?.architecture,
    },
    ...(template?.name ? { templateName: template.name } : {}),
  });

  return { ...result, templateName: template?.name ?? null };
}
