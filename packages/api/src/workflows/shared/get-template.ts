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
import { db } from "@virtbase/db/client";
import { proxmoxTemplatesToProxmoxNodes as pt2pn } from "@virtbase/db/schema";
import { FatalError } from "workflow";

type GetTemplateStepParams = {
  proxmoxTemplateId: string;
  proxmoxNodeId: string;
};

export async function getTemplateStep({
  proxmoxTemplateId,
  proxmoxNodeId,
}: GetTemplateStepParams) {
  "use step";
  const template = await db.transaction(
    async (tx) => {
      return tx
        .select({
          vmid: pt2pn.vmid,
          storage: pt2pn.storage,
        })
        .from(pt2pn)
        .where(
          and(
            eq(pt2pn.proxmoxNodeId, proxmoxNodeId),
            eq(pt2pn.proxmoxTemplateId, proxmoxTemplateId),
          ),
        )
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!template) {
    throw new FatalError(
      `The Proxmox template with ID "${proxmoxTemplateId}" does not exist. Aborting.`,
    );
  }

  return template;
}
