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

/**
 * Normalize config values for comparison. Proxmox stores booleans as `0`/`1`
 * and some numeric fields as strings (e.g. `cpulimit: "1"`), so strict
 * equality would report spurious changes when the logical value is unchanged.
 */
function normalizeConfigValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

export async function applyGuestConfigStep(params: ApplyGuestConfigStepParams) {
  "use step";

  const { proxmoxNode, vmid, config, mode = "async" } = params;

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  // Include pending changes so the diff reflects the state the guest will
  // actually be in when the PUT/POST is applied.
  const currentConfig = await vm.config.$get({ current: true });

  const func = mode === "sync" ? vm.config.$put : vm.config.$post;
  const upid = await func(config);

  // Capture the previous values for every key we are changing so that a
  // rollback can restore them. Also track keys that did not exist before
  // (newly added) so that a rollback can delete them again.
  const previousConfig: Partial<ConfigInput> = {};
  const addedKeys: string[] = [];

  for (const key in config) {
    if (key === "delete") continue;
    const currentValue = currentConfig[key];
    // @ts-expect-error - Type mismatch between string and enums
    const nextValue = config[key];
    if (normalizeConfigValue(currentValue) === normalizeConfigValue(nextValue))
      continue;

    if (currentValue === undefined) {
      addedKeys.push(key);
    } else {
      // @ts-expect-error - Type mismatch between string and enums
      previousConfig[key] = currentValue;
    }
  }

  // Keys removed via `delete` need their previous value captured so they can
  // be re-applied on rollback.
  if (typeof config.delete === "string" && config.delete.length > 0) {
    const deletedKeys = config.delete
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    for (const key of deletedKeys) {
      const currentValue = currentConfig[key];
      if (currentValue === undefined) continue;
      // @ts-expect-error - Type mismatch between string and enums
      previousConfig[key] = currentValue;
    }
  }

  return {
    upid,
    previousConfig,
    addedKeys,
  };
}

type RollbackApplyGuestConfigStepParams = Pick<
  ApplyGuestConfigStepParams,
  "vmid" | "proxmoxNode" | "mode"
> & {
  previousConfig: Partial<ConfigInput>;
  /**
   * Keys that were newly added by the forward step and therefore need to be
   * deleted again on rollback. Optional for backwards compatibility.
   */
  addedKeys?: string[];
};

export async function rollbackApplyGuestConfigStep(
  params: RollbackApplyGuestConfigStepParams,
) {
  "use step";

  const {
    proxmoxNode,
    vmid,
    mode = "async",
    previousConfig,
    addedKeys = [],
  } = params;

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const rollbackConfig: Partial<ConfigInput> = { ...previousConfig };
  if (addedKeys.length > 0) {
    // Merge with any pre-existing `delete` in previousConfig (shouldn't
    // normally happen, but preserve it defensively).
    const existingDelete =
      typeof rollbackConfig.delete === "string" ? rollbackConfig.delete : "";
    rollbackConfig.delete = [existingDelete, addedKeys.join(",")]
      .filter(Boolean)
      .join(",");
  }

  // Nothing to do if neither restoration nor deletion is needed.
  if (Object.keys(rollbackConfig).length === 0) {
    return { upid: null };
  }

  const func = mode === "sync" ? vm.config.$put : vm.config.$post;
  const upid = await func(rollbackConfig);

  return {
    upid,
  };
}
