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

import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { refreshTemplateImages } from "@virtbase/api/template-images";
import {
  applyCloudInitStep,
  createGuestFromImageStep,
  getTemplateStep,
  rollbackApplyCloudInitStep,
  rollbackCreateGuestFromImageStep,
} from "@virtbase/api/workflows";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes,
  proxmoxTemplateGroups,
  proxmoxTemplateImages,
  proxmoxTemplates,
} from "@virtbase/db/schema";

/**
 * Drives the real Phase 4 workflow steps against the local cluster.
 *
 * Calls `getTemplateStep`, `createGuestFromImageStep` and `applyCloudInitStep`
 * themselves rather than reimplementing what they do, so the thing under test
 * is the code provisioning actually runs. Then boots the guest and reads its
 * own report off the serial console.
 *
 *   bun script dev/verify-provision-steps
 *   bun script dev/verify-provision-steps --cleanup
 *   bun script dev/verify-provision-steps --rollback   (exercise the rollbacks)
 */
const GROUP_ID = "ptg_0000000000000000000000007";
const TEMPLATE_ID = "temp_000000000000000000000007";
/** The guest is found by name: `cluster.nextid` allocates its vmid. */
const GUEST_NAME = "verify-provision-steps";

const IMAGE_URL =
  "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2";

const ADAPTERS = [
  {
    macaddress: "BC:24:11:00:94:00",
    addresses: { 4: ["172.30.0.70/24"], 6: [] } as Record<4 | 6, string[]>,
    gateways: { 4: ["172.30.0.1"], 6: [] } as Record<4 | 6, string[]>,
    vlan: 0,
    bridge: "vmbr0",
  },
];

async function main() {
  await cleanup();

  await db
    .insert(proxmoxTemplateGroups)
    .values({ id: GROUP_ID, name: "__verify-provision-steps" });
  await db.insert(proxmoxTemplates).values({
    id: TEMPLATE_ID,
    proxmoxTemplateGroupId: GROUP_ID,
    name: "Debian 13 (step verification)",
    enabled: true,
    imageUrl: IMAGE_URL,
    osFamily: "debian",
    osVersion: "13",
    packageManager: "apt",
    initSystem: "systemd",
  });

  const [node] = await db.select().from(proxmoxNodes).limit(1);
  if (!node) throw new Error("no proxmox node registered");

  // Warm the image first, exactly as the refresh cron does. `getTemplateStep`
  // would otherwise take its cold-node branch, which raises a `RetryableError`
  // built from `getStepMetadata()` - and that is only available inside a real
  // workflow, so it cannot be driven from a script. The deferral path is
  // therefore exercised by the workflow runtime, not here.
  console.log("[0] warming the image (as the cron does)");
  for (let i = 0; i < 60; i++) {
    const result = await refreshTemplateImages({ db });
    if (result.ready > 0) break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log("[1] getTemplateStep");
  const template = await getTemplateStep({
    proxmoxTemplateId: TEMPLATE_ID,
    proxmoxNode: node,
  });
  console.log(`    volid=${template.volid}`);
  console.log(
    `    ostype=${template.ostype} machine=${template.machine} bios=${template.biosType} cpu=${template.cpuType}\n`,
  );

  const instance = getProxmoxInstance(node);

  // --- createGuestFromImageStep -------------------------------------------
  console.log("[2] createGuestFromImageStep");
  const { createdVmid, createdName, createUpid } =
    await createGuestFromImageStep({
      proxmoxNode: node,
      volid: template.volid,
      storage: node.vmStorage,
      template,
      name: GUEST_NAME,
    });
  console.log(`    vmid=${createdVmid} name=${createdName}`);
  await waitForTask(instance, createUpid);
  console.log("    imported\n");

  if (process.argv.includes("--rollback")) {
    console.log("[rollback] rollbackCreateGuestFromImageStep");
    await rollbackCreateGuestFromImageStep({
      proxmoxNode: node,
      vmid: createdVmid,
      createUpid,
    });
    const gone = await guestIsGone(instance, createdVmid);
    console.log(`    guest removed: ${gone ? "PASS" : "FAIL"}`);
    await cleanup();
    process.exit(gone ? 0 : 1);
  }

  // Minimal hardware + cloud-init user config; `applyHardwareConfigStep` owns
  // this in the real workflow and needs a plan we do not have here.
  await instance.node.qemu.$(createdVmid).config.$put({
    memory: "2048",
    cores: 2,
    agent: "enabled=1",
    ciuser: "root",
    cipassword: crypto.randomUUID(),
    ciupgrade: false,
    nameserver: "9.9.9.9",
    serial0: "socket",
    vga: "std",
    net0: `virtio=${ADAPTERS[0]?.macaddress},bridge=vmbr0`,
  } as never);

  // --- applyCloudInitStep --------------------------------------------------
  console.log("[3] applyCloudInitStep");
  const { cicustomUpid, networkFilename, vendorFilename, appliedSnippets } =
    await applyCloudInitStep({
      proxmoxNode: node,
      vmid: createdVmid,
      proxmoxTemplateId: TEMPLATE_ID,
      adapters: ADAPTERS,
    });
  await waitForTask(instance, cicustomUpid);
  console.log(`    network=${networkFilename} vendor=${vendorFilename}`);
  console.log(`    snippets: ${appliedSnippets.join(", ")}`);

  const config = await instance.node.qemu.$(createdVmid).config.$get();
  console.log(`    cicustom=${config.cicustom}\n`);

  console.log("[4] booting");
  await instance.node.qemu.$(createdVmid).status.start.$post({});
  console.log(
    `\n    watch:  docker exec virtbase-${node.hostname} socat -u UNIX-CONNECT:/var/run/qemu-server/${createdVmid}.serial0 -`,
  );
  console.log("    clean:  bun script dev/verify-provision-steps --cleanup\n");
}

/**
 * Polls rather than checking once: `$delete` returns a UPID and Proxmox
 * destroys the guest asynchronously, so an immediate read still sees it.
 */
async function guestIsGone(
  instance: ReturnType<typeof getProxmoxInstance>,
  vmid: number,
): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    try {
      await instance.node.qemu.$(vmid).status.current.$get();
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  return false;
}

async function waitForTask(
  instance: ReturnType<typeof getProxmoxInstance>,
  upid: string,
) {
  for (let i = 0; i < 600; i++) {
    const status = await instance.node.tasks.$(upid).status.$get();
    if (status.status === "stopped") {
      if (status.exitstatus !== "OK") {
        throw new Error(`task failed: ${status.exitstatus}`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("task timed out");
}

async function cleanup() {
  const nodes = await db.select().from(proxmoxNodes);

  for (const node of nodes) {
    const instance = getProxmoxInstance(node);

    const guests = await instance.node.qemu.$get().catch(() => []);
    const mine = guests.filter((guest) => guest.name === GUEST_NAME);

    for (const guest of mine) {
      const vmid = guest.vmid;

      try {
        await instance.node.qemu.$(vmid).status.stop.$post({});
      } catch {
        // Already stopped.
      }
      for (let i = 0; i < 30; i++) {
        try {
          const status = await instance.node.qemu.$(vmid).status.current.$get();
          if (status.status === "stopped") break;
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      // The step's own rollback, so cleanup exercises it too.
      try {
        await rollbackApplyCloudInitStep({ proxmoxNode: node, vmid });
      } catch {
        // Nothing to undo.
      }

      try {
        await instance.node.qemu.$(vmid).$delete({
          purge: true,
          "destroy-unreferenced-disks": true,
        } as never);
      } catch {
        // Already gone.
      }
    }
  }

  const rows = await db
    .select()
    .from(proxmoxTemplateImages)
    .where(eq(proxmoxTemplateImages.proxmoxTemplateId, TEMPLATE_ID));

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.volid)) continue;
    seen.add(row.volid);
    const node = nodes.find((n) => n.id === row.proxmoxNodeId);
    if (!node) continue;
    try {
      await getProxmoxInstance(node)
        .node.storage.$(row.storage)
        .content.$(row.volid)
        .$delete();
    } catch {
      // Already gone.
    }
  }

  await db.delete(proxmoxTemplates).where(eq(proxmoxTemplates.id, TEMPLATE_ID));
  await db
    .delete(proxmoxTemplateGroups)
    .where(eq(proxmoxTemplateGroups.id, GROUP_ID));
}

if (process.argv.includes("--cleanup")) {
  await cleanup();
  console.log("cleaned up");
} else {
  await main();
}

process.exit(0);
