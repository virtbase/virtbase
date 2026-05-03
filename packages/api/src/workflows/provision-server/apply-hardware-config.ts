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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { sshKeys } from "@virtbase/db/schema";
import { generatePassword } from "@virtbase/utils";
import type { GetProxmoxInstanceParams } from "../../proxmox";
import { getProxmoxInstance } from "../../proxmox";

type ApplyHardwareConfigStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
  plan: {
    cores: number;
    memory: number;
    storage: number;
  };
  initialRootPassword?: string | null;
  initialSSHKeyId?: string | null;
};

export async function applyHardwareConfigStep({
  proxmoxNode,
  vmid,
  plan,
  initialRootPassword,
  initialSSHKeyId,
}: ApplyHardwareConfigStepParams) {
  "use step";

  // Try to retrieve the SSH key from the database.
  // If the SSH key is not found, skip the SSH key configuration.
  let publicKey: string | null = null;
  if (initialSSHKeyId) {
    try {
      const result = await db.transaction(
        async (tx) => {
          return tx
            .select({
              publicKey: sshKeys.publicKey,
            })
            .from(sshKeys)
            .where(eq(sshKeys.id, initialSSHKeyId))
            .limit(1)
            .then(([res]) => res);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      if (!result) {
        console.info(
          `No SSH key was found with ID "${initialSSHKeyId}". Skipping SSH key configuration.`,
        );
      } else {
        publicKey = result.publicKey;
      }
    } catch {
      console.error(
        `Failed to retrieve SSH key with ID "${initialSSHKeyId}". Skipping SSH key configuration.`,
      );
    }
  }

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  // If no root password was provided, generate a new one.
  const cipassword = initialRootPassword || generatePassword(12);

  const configUpid = await vm.config.$post({
    // Enable KVM hardware virtualization.
    kvm: true,
    cpu: "cputype=host",
    // Never go over 100% CPU usage (otherwise QEMU will allow overcommit)
    cpulimit: plan.cores,
    cores: plan.cores,
    memory: `${plan.memory}`,
    balloon: plan.memory,
    tablet: false,
    rng0: "source=/dev/urandom",
    // Also possible to use serial0, but will cause issues with symbols and not show boot process
    vga: "std",
    machine: "q35",
    // Start the VM on host node boot
    onboot: true,
    // Enable QEMU guest agent
    agent: "enabled=1,fstrim_cloned_disks=1",
    ostype: "l26", // Linux 2.6 - 6.X Kernel
    freeze: false, // Don't freeze the VM when booting up
    hotplug: "0", // Don't allow any hotplugging of devices (enhanced security)
    tags: [
      "virtbase",
      // Add tag `preview` or `development` if not in production
      process.env.NEXT_PUBLIC_VERCEL_ENV !== "production"
        ? process.env.NEXT_PUBLIC_VERCEL_ENV
        : "",
    ]
      .filter(Boolean)
      .join(","),
    // Cloud init configuration
    ciuser: "root",
    cipassword,
    ciupgrade: true,
    ...(publicKey ? { sshkeys: encodeURIComponent(publicKey) } : {}),
  });

  return {
    configUpid,
    rootPassword: cipassword,
    isRootPasswordGenerated: !initialRootPassword,
    sshKeyApplied: !!publicKey,
  };
}

/**
 * WARNING:
 * This step will delete the entire hardware configuration of the guest.
 * Any custom hardware configuration will be lost.
 */
export async function rollbackApplyHardwareConfigStep({
  proxmoxNode,
  vmid,
}: Pick<ApplyHardwareConfigStepParams, "proxmoxNode"> & {
  vmid: number;
}) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  // Use $put for synchronous update
  await vm.config.$put({
    delete:
      "kvm,cores,memory,onboot,agent,ciuser,cipassword,ciupgrade,ostype,freeze,hotplug,tags",
  });
}
