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

import type { GetProxmoxInstanceParams } from "../../proxmox";
import { getProxmoxInstance } from "../../proxmox";

type UpdateHASettingsStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
  mode: "create" | "delete";
  nodes?: string[];
};

export async function updateHASettingsStep(params: UpdateHASettingsStepParams) {
  "use step";

  const { proxmoxNode, vmid, mode, nodes = [] } = params;

  const { cluster } = getProxmoxInstance(proxmoxNode);

  const resources = await cluster.ha.resources.$get({
    type: "vm",
  });
  const existing = resources.find((resource) => resource.sid === `vm:${vmid}`);

  const sid = `vm:${vmid}`;
  if (mode === "create") {
    if (existing) {
      console.info(
        `[@virtbase/api] HA resource for VM ${vmid} already exists, skipping creation.`,
      );
      return;
    }

    // Create a new HA resource for the given VM
    await cluster.ha.resources.$post({
      sid,
      comment: "System generated HA resource",
      max_relocate: 1,
      max_restart: 1,
      state: "started",
    });

    // Create a separate rule for the given VM
    await cluster.ha.rules.$post({
      rule: `ha-rule-${vmid}`,
      type: "node-affinity",
      comment: "System generated HA rule",
      disable: 0,
      nodes: [
        // Remove duplicates
        ...new Set([proxmoxNode.hostname, ...nodes]),
      ]
        .map(
          (hostname) =>
            // Assign each node the same priority
            `${hostname}:0`,
        )
        .join(","),
      resources: sid,
      strict: 1,
    });
  } else {
    if (!existing) {
      console.info(
        `[@virtbase/api] HA resource for VM ${vmid} does not exist, skipping deletion.`,
      );
      return;
    }

    // @ts-expect-error - purge is not available in proxmox-api
    await cluster.ha.resources.$(sid).$delete({
      // Remove this resource from rules that reference it
      // This should delte the custom rule as well
      purge: 1,
    });
  }
}
