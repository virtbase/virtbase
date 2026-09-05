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

import type { ProxmoxEngine } from "@virtbase/proxmox-api";

export type CreateHaRuleParams = {
  /** Rule identifier, unique across the cluster. */
  rule: string;
  type: "node-affinity" | "resource-affinity";
  /** Comma-separated HA resource ids, e.g. `vm:100,vm:101`. */
  resources: string;
  /** Comma-separated `<node>[:<priority>]` entries. `node-affinity` only. */
  nodes?: string;
  /** Whether the rule is a hard constraint rather than a preference. */
  strict?: boolean | 0 | 1;
  /** `resource-affinity` only: keep the resources together, or apart. */
  affinity?: "positive" | "negative";
  comment?: string;
  disable?: boolean | 0 | 1;
};

/**
 * Create an HA rule.
 *
 * `POST /cluster/ha/rules` exists on the generated client but takes no
 * arguments there, because Proxmox does not declare its parameters statically:
 * `PVE::API2::HA::Rules` sets `parameters => PVE::HA::Rules->createSchema()`,
 * assembled at runtime from the registered rule plugins, so a generator reading
 * the schema sees an endpoint with no properties. The same is true of the
 * matching `PUT`; only the `DELETE`, whose one parameter is in the path, comes
 * out right.
 *
 * The parameters below are therefore written by hand against
 * `PVE::HA::Rules::NodeAffinity` and `::ResourceAffinity`. Drop this module and
 * call `cluster.ha.rules.$post()` directly once the client models the endpoint.
 *
 * @see https://git.proxmox.com/?p=pve-ha-manager.git;a=blob;f=src/PVE/API2/HA/Rules.pm
 */
export const createHaRule = async (
  engine: ProxmoxEngine,
  params: CreateHaRuleParams,
): Promise<void> => {
  await engine.doRequest(
    "POST",
    "/api2/json/cluster/ha/rules",
    "/api2/json/cluster/ha/rules",
    params,
  );
};
