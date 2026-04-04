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

import type { GetProxmoxInstanceParams, ProxmoxInstance } from "../../proxmox";
import { getProxmoxInstance } from "../../proxmox";

type ConfigInput = NonNullable<
  Parameters<
    ReturnType<ProxmoxInstance["node"]["qemu"]["$"]>["config"]["$put"]
  >[0]
>;

type ApplyGuestConfigStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
  config: ConfigInput;
  mode?: "sync" | "async";
};

export async function applyGuestConfigStep(params: ApplyGuestConfigStepParams) {
  "use step";

  const { proxmoxNode, vmid, config, mode = "async" } = params;

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const currentConfig = await vm.config.$get();

  const func = mode === "sync" ? vm.config.$put : vm.config.$post;
  const upid = await func(config);

  // Only return changed config values
  const previousConfig: Partial<ConfigInput> = {};
  for (const key in currentConfig) {
    // @ts-expect-error - Type mismatch between string and enums
    if (currentConfig[key] !== config[key]) {
      // @ts-expect-error - Type mismatch between string and enums
      previousConfig[key] = currentConfig[key];
    }
  }

  return {
    upid,
    previousConfig,
  };
}

type RollbackApplyGuestConfigStepParams = Pick<
  ApplyGuestConfigStepParams,
  "vmid" | "proxmoxNode" | "mode"
> & {
  previousConfig: Partial<ConfigInput>;
};

export async function rollbackApplyGuestConfigStep(
  params: RollbackApplyGuestConfigStepParams,
) {
  "use step";

  const { proxmoxNode, vmid, mode = "async", previousConfig } = params;

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const func = mode === "sync" ? vm.config.$put : vm.config.$post;
  const upid = await func(previousConfig);

  return {
    upid,
  };
}
