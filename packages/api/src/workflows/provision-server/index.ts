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

import { FatalError } from "workflow";
import { cloneGuestStep } from "../shared/clone-guest";
import { getTemplateStep } from "./get-template";
import { selectProxmoxNodeStep } from "./select-proxmox-node";

type ProvisionServerWorkflowParams = {
  serverPlanId: string;
  proxmoxTemplateId?: string | null;
};

export async function provisionServerWorkflow({
  serverPlanId,
  proxmoxTemplateId,
}: ProvisionServerWorkflowParams) {
  "use workflow";

  const { plan, selectedNode } = await selectProxmoxNodeStep({ serverPlanId });

  if (!proxmoxTemplateId) {
    // TODO: Implement custom iso flow
    throw new FatalError(
      "Provisioning a server without a template is currently not implemented.",
    );
  }

  const template = await getTemplateStep({
    proxmoxTemplateId,
    selectedNodeId: selectedNode.id,
  });

  const { clonedVmid, cloneUpid } = await cloneGuestStep({
    proxmoxNode: selectedNode,
    vmid: template.vmid,
    options: {
      target: template.storage,
    },
  });
}
