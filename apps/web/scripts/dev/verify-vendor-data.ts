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
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes,
  proxmoxTemplateGroups,
  proxmoxTemplateImages,
  proxmoxTemplates,
} from "@virtbase/db/schema";
import type { RenderableSnippet } from "@virtbase/utils";
import { BASE_SNIPPETS, renderVendorData } from "@virtbase/utils";

/**
 * Boots a real guest from the *generated* base vendor data.
 *
 * Phase 0 proved the mechanism with a hand-written document. This proves the
 * document the renderer actually produces - that the base snippets replacing
 * `virt-customize` do on a live boot what the bake step used to do.
 *
 *   bun script dev/verify-vendor-data
 */
const GROUP_ID = "ptg_0000000000000000000000008";
const TEMPLATE_ID = "temp_000000000000000000000008";
const VMID = 9300;

const IMAGE_URL =
  "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2";

/**
 * A probe snippet, composed alongside the real base set so the merge itself is
 * exercised, not just the base snippets in isolation.
 */
const PROBE: RenderableSnippet = {
  slug: "zz-probe",
  kind: "cloud-config",
  priority: 900,
  targets: {},
  content: `runcmd:
  - [ sh, -c, '{ echo "agent=$(systemctl is-active qemu-guest-agent 2>&1)"; echo "agent-pkg=$(dpkg-query -W -f=''\${Status}'' qemu-guest-agent 2>&1)"; echo "dropin=$(test -f /etc/ssh/sshd_config.d/60-virtbase.conf && echo present || echo MISSING)"; echo "debian-user=$(id debian 2>&1)"; echo "sshd=$(sshd -T 2>/dev/null | grep -E ''^(permitrootlogin|passwordauthentication|maxauthtries)'' | tr ''\\n'' '' '')"; echo "root=$(passwd -S root 2>&1)"; } > /dev/ttyS0' ]
  - [ sh, -c, 'echo "----PROBE-END----" > /dev/ttyS0' ]
`,
};

async function main() {
  const rendered = renderVendorData({
    snippets: [...BASE_SNIPPETS, PROBE],
    context: {
      osFamily: "debian",
      packageManager: "apt",
      initSystem: "systemd",
      architecture: "amd64",
      osVersion: "13",
    },
    templateName: "Debian 13 (Trixie)",
  });

  if (!rendered.content) throw new Error("nothing rendered");
  console.log(`rendered ${rendered.applied.length} snippets:`);
  console.log(`  ${rendered.applied.join(", ")}`);
  console.log(`  conflicts: ${rendered.conflicts.length}`);
  console.log(`  errors: ${rendered.errors.length}\n`);

  await cleanup();

  await db
    .insert(proxmoxTemplateGroups)
    .values({ id: GROUP_ID, name: "__verify-vendor-data" });
  await db.insert(proxmoxTemplates).values({
    id: TEMPLATE_ID,
    proxmoxTemplateGroupId: GROUP_ID,
    name: "Debian 13 (vendor-data verification)",
    enabled: true,
    imageUrl: IMAGE_URL,
    osFamily: "debian",
    osVersion: "13",
    packageManager: "apt",
    initSystem: "systemd",
  });

  // Reuse the Phase 2 lifecycle rather than downloading by hand.
  console.log("[1] ensuring image");
  for (let i = 0; i < 40; i++) {
    const result = await refreshTemplateImages({ db });
    if (result.ready > 0) break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  const [image] = await db
    .select()
    .from(proxmoxTemplateImages)
    .where(eq(proxmoxTemplateImages.proxmoxTemplateId, TEMPLATE_ID))
    .limit(1);

  if (!image?.downloadedAt) throw new Error("image never became ready");
  console.log(`    ${image.volid}\n`);

  const [node] = await db
    .select()
    .from(proxmoxNodes)
    .where(eq(proxmoxNodes.id, image.proxmoxNodeId))
    .limit(1);
  if (!node) throw new Error("node vanished");

  const instance = getProxmoxInstance(node);

  console.log("[2] uploading vendor data");
  const filename = `ci-vendor-${VMID}.yml`;
  await instance.uploadSnippet({
    filename,
    storage: node.snippetStorage,
    contents: rendered.content,
  });

  console.log("[3] creating guest from the image");
  const createUpid = await instance.node.qemu.$post({
    vmid: VMID,
    name: "verify-vendor-data",
    ostype: "l26",
    machine: "q35",
    cpu: "host",
    cores: 2,
    memory: "2048",
    scsihw: "virtio-scsi-single",
    scsi0: `vm-storage:0,import-from=${image.volid},discard=on,iothread=1,ssd=1,cache=writeback`,
    ide2: "vm-storage:cloudinit",
    net0: "virtio,bridge=vmbr0",
    boot: "order=scsi0",
    serial0: "socket",
    vga: "std",
    agent: "enabled=1",
    ciuser: "root",
    cipassword: crypto.randomUUID(),
    ciupgrade: false,
    nameserver: "9.9.9.9",
    ipconfig0: "ip=172.30.0.60/24,gw=172.30.0.1",
    cicustom: `vendor=${node.snippetStorage}:snippets/${filename}`,
  } as never);

  await waitForTask(instance, createUpid as string);

  console.log("[4] booting");
  await instance.node.qemu.$(VMID).status.start.$post({});

  console.log("\n[5] guest report (from serial console)\n");
  console.log(
    "    run this in another terminal to watch it live:\n" +
      `    docker exec ${`virtbase-${node.hostname}`} socat -u UNIX-CONNECT:/var/run/qemu-server/${VMID}.serial0 -\n`,
  );
  console.log(
    "    the guest is left running on purpose so the report can be read;\n" +
      `    remove it with:  bun script dev/verify-vendor-data --cleanup\n`,
  );
}

async function waitForTask(
  instance: ReturnType<typeof getProxmoxInstance>,
  upid: string,
) {
  for (let i = 0; i < 300; i++) {
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

    // Proxmox refuses to delete a running guest, and this one is deliberately
    // left running so its report can be read - so stop it first.
    try {
      await instance.node.qemu.$(VMID).status.stop.$post({});
    } catch {
      // Already stopped, or not on this node.
    }

    for (let i = 0; i < 30; i++) {
      try {
        const status = await instance.node.qemu.$(VMID).status.current.$get();
        if (status.status === "stopped") break;
      } catch {
        break; // Not on this node.
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    try {
      await instance.node.qemu
        .$(VMID)
        .$delete({ purge: true, "destroy-unreferenced-disks": true } as never);
    } catch {
      // Not on this node.
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

  // The uploaded vendor snippet is not tied to the template row, so it has to
  // be removed explicitly or it outlives the guest it was written for.
  for (const node of nodes) {
    try {
      await getProxmoxInstance(node)
        .node.storage.$(node.snippetStorage)
        .content.$(`${node.snippetStorage}:snippets/ci-vendor-${VMID}.yml`)
        .$delete();
    } catch {
      // Never uploaded, or already cleaned up.
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
