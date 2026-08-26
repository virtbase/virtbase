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

import {
  invalidateDetectionGuard,
  isDetectionStale,
  refreshServerOperatingSystem,
} from "@virtbase/api/guest-os";
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { refreshTemplateImages } from "@virtbase/api/template-images";
import {
  applyCloudInitStep,
  createGuestFromImageStep,
  getTemplateStep,
  rollbackApplyCloudInitStep,
} from "@virtbase/api/workflows";
import { and, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes,
  proxmoxTemplateGroups,
  proxmoxTemplateImages,
  proxmoxTemplates,
  servers,
} from "@virtbase/db/schema";
import { resolveServerOperatingSystem } from "@virtbase/utils";

/**
 * Proves guest operating system detection against a real guest.
 *
 * The unit tests cover the catalog, the precedence chain and the staleness
 * rule with fabricated replies. What they cannot cover is the part that only
 * a real `qemu-guest-agent` answers: that `guest-get-osinfo` returns what we
 * think it does, that a freshly booted guest is re-read rather than trusted
 * from before its boot, and that what lands in the database is a Debian the
 * dashboard can put a logo on.
 *
 * Builds a Debian guest from the same workflow steps provisioning uses, boots
 * it, waits for cloud-init to install the agent, then drives the detection
 * code itself against a real `servers` row.
 *
 *   bun script dev/verify-guest-os
 *   bun script dev/verify-guest-os --cleanup
 */
const GROUP_ID = "ptg_00000000000000000000000O8";
const TEMPLATE_ID = "temp_00000000000000000000000O8";
const SERVER_ID = "kvm_00000000000000000000000O8";
/** The guest is found by name: `cluster.nextid` allocates its vmid. */
const GUEST_NAME = "verify-guest-os";
/** Unique in the table, so cleanup can find an earlier run's rows by it. */
const GROUP_NAME = "__verify-guest-os";

const IMAGE_URL =
  "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2";

const ADAPTERS = [
  {
    macaddress: "BC:24:11:00:94:08",
    addresses: { 4: ["172.30.0.78/24"], 6: [] } as Record<4 | 6, string[]>,
    gateways: { 4: ["172.30.0.1"], 6: [] } as Record<4 | 6, string[]>,
    vlan: 0,
    bridge: "vmbr0",
  },
];

/** How long to wait for cloud-init to install and start the agent. */
const AGENT_TIMEOUT_SECONDS = 420;

let failures = 0;

const check = (label: string, passed: boolean, detail?: unknown) => {
  console.log(`    ${passed ? "PASS" : "FAIL"}  ${label}`);
  if (detail !== undefined) console.log(`          ${JSON.stringify(detail)}`);
  if (!passed) failures++;
};

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    console.log("cleaned up");
    return;
  }

  await cleanup();

  const [node] = await db.select().from(proxmoxNodes).limit(1);
  if (!node) throw new Error("no proxmox node registered");

  await db
    .insert(proxmoxTemplateGroups)
    .values({ id: GROUP_ID, name: GROUP_NAME });
  await db.insert(proxmoxTemplates).values({
    id: TEMPLATE_ID,
    proxmoxTemplateGroupId: GROUP_ID,
    // Deliberately *not* Debian: the point of the feature is that what the
    // guest reports beats what the template claims, and a template that
    // already said Debian could not tell the two apart.
    name: "AlmaLinux 9 (deliberately wrong)",
    icon: "/assets/static/distros/almalinux.svg",
    enabled: true,
    imageUrl: IMAGE_URL,
    osFamily: "debian",
    osVersion: "13",
    packageManager: "apt",
    initSystem: "systemd",
  });

  console.log("[0] warming the image (as the cron does)");
  // Polls this template's own row rather than the sweep's `ready` count: that
  // count is a total across every template, so a cluster with any other image
  // already downloaded would break the loop before ours had started.
  let warmed = false;
  for (let i = 0; i < 180; i++) {
    await refreshTemplateImages({ db });

    const [image] = await db
      .select()
      .from(proxmoxTemplateImages)
      .where(eq(proxmoxTemplateImages.proxmoxTemplateId, TEMPLATE_ID))
      .limit(1);

    if (image?.downloadedAt) {
      warmed = true;
      console.log(`    ready after ${i * 5}s: ${image.volid}`);
      break;
    }
    if (image?.failedAt) {
      throw new Error(`image download failed: ${image.lastError}`);
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!warmed) throw new Error("image never finished downloading");

  console.log("[1] getTemplateStep");
  const template = await getTemplateStep({
    proxmoxTemplateId: TEMPLATE_ID,
    proxmoxNode: node,
  });
  console.log(`    volid=${template.volid}`);

  const instance = getProxmoxInstance(node);

  console.log("[2] createGuestFromImageStep");
  const { createdVmid, createUpid } = await createGuestFromImageStep({
    proxmoxNode: node,
    volid: template.volid,
    storage: node.vmStorage,
    template,
    name: GUEST_NAME,
  });
  await waitForTask(instance, createUpid);
  console.log(`    vmid=${createdVmid}`);

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

  console.log("[3] applyCloudInitStep");
  const { cicustomUpid } = await applyCloudInitStep({
    proxmoxNode: node,
    vmid: createdVmid,
    proxmoxTemplateId: TEMPLATE_ID,
    adapters: ADAPTERS,
  });
  await waitForTask(instance, cicustomUpid);

  // A `servers` row is what detection actually writes to.
  // The seed carries one legacy plan whose id predates the `pck_` prefix the
  // validators enforce, and a server pointing at it fails output validation on
  // every list. Pick a plan the API will actually serialise.
  const plan = (await db.query.serverPlans.findMany()).find((row) =>
    row.id.startsWith("pck_"),
  );
  const price = plan
    ? (await db.query.serverPlanPrices.findMany()).find(
        (row) => row.serverPlanId === plan.id,
      )
    : undefined;
  const [user] = await db.query.users.findMany({ limit: 1 });
  if (!(plan && price && user)) {
    throw new Error("seed the database first: bun script dev/cluster");
  }

  // A stale fixture row may already hold this (node, vmid) pair - the seed
  // creates servers pointing at guests that a `cluster:reset` destroyed, and
  // Proxmox hands the freed vmid straight back out. Against a disposable
  // cluster such a row is by definition dead, so it goes.
  await db
    .delete(servers)
    .where(
      and(eq(servers.proxmoxNodeId, node.id), eq(servers.vmid, createdVmid)),
    );

  await db.insert(servers).values({
    id: SERVER_ID,
    userId: user.id,
    serverPlanId: plan.id,
    serverPlanPriceId: price.id,
    proxmoxNodeId: node.id,
    proxmoxTemplateId: TEMPLATE_ID,
    name: GUEST_NAME,
    vmid: createdVmid,
    installedAt: new Date(),
  });

  const vm = instance.node.qemu.$(createdVmid);

  console.log("\n[4] before boot");
  {
    const status = await vm.status.current.$get();
    const server = await readServer();

    check(
      "a stopped server is not considered stale",
      !isDetectionStale({
        server,
        running: status.status === "running",
        uptime: status.uptime,
      }),
    );

    const stored = await refreshServerOperatingSystem({
      db,
      vm,
      server,
      force: true,
    });
    check("probing a stopped server stores nothing", stored === null);

    const after = await readServer();
    check(
      "a failed probe leaves the columns untouched",
      after.detectedOsAt === null && after.detectedOsId === null,
    );
    check(
      "the display falls back to the template",
      resolveServerOperatingSystem({
        server: after,
        template: {
          name: template.name,
          icon: "/assets/static/distros/almalinux.svg",
        },
      }).source === "template",
    );
  }

  console.log("\n[5] booting and waiting for the agent");
  await vm.status.start.$post({});

  const started = Date.now();
  let answered = false;
  while ((Date.now() - started) / 1000 < AGENT_TIMEOUT_SECONDS) {
    try {
      await vm.agent.info.$get();
      answered = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log(
    `    agent answered after ${Math.round((Date.now() - started) / 1000)}s: ${answered}`,
  );
  if (!answered) {
    check("the guest agent came up", false);
    console.log("\n    (leaving the guest running for inspection)");
    process.exit(1);
  }

  console.log("\n[6] detection");
  {
    const status = await vm.status.current.$get();
    const server = await readServer();

    check(
      "a never-detected running server is stale",
      isDetectionStale({
        server,
        running: status.status === "running",
        uptime: status.uptime,
      }),
    );

    const stored = await refreshServerOperatingSystem({
      db,
      vm,
      server,
      force: true,
    });
    check("the probe stored something", stored !== null, stored);

    const after = await readServer();
    check(
      "it detected Debian, not the template's AlmaLinux",
      after.detectedOsId === "debian",
      {
        id: after.detectedOsId,
        name: after.detectedOsName,
        version: after.detectedOsVersion,
        kernel: after.detectedOsKernel,
      },
    );
    check("it recorded when it looked", after.detectedOsAt !== null);

    const resolved = resolveServerOperatingSystem({
      server: after,
      template: {
        name: template.name,
        icon: "/assets/static/distros/almalinux.svg",
      },
    });
    check(
      "the display now reports the guest, not the template",
      resolved.source === "detected",
      resolved,
    );
    check(
      "it resolves to the Debian logo",
      resolved.icon === "/assets/static/distros/debian.svg",
    );
  }

  console.log("\n[7] the guard");
  {
    // Needs the Upstash REST proxy: `once` fails open by design, so without
    // Redis every probe runs and this would report a guard that is not there.
    //   docker compose up -d serverless-redis-http
    const server = await readServer();
    const first = await refreshServerOperatingSystem({ db, vm, server });
    const second = await refreshServerOperatingSystem({ db, vm, server });

    check("the first unforced probe runs", first !== null);
    check("a second probe within the guard is suppressed", second === null);

    await invalidateDetectionGuard(server.id);
    const third = await refreshServerOperatingSystem({ db, vm, server });
    check("dropping the guard lets the next probe through", third !== null);
  }

  console.log("\n[8] a reboot makes the detection stale again");
  {
    const status = await vm.status.current.$get();
    const server = await readServer();

    check(
      "fresh detection on a long-running guest is not stale",
      !isDetectionStale({ server, running: true, uptime: status.uptime }),
    );
    // `uptime: 0` puts the boot at exactly now, so any detection - including
    // one written a moment ago - predates it. A small non-zero uptime would
    // race the timestamp this script just wrote.
    check(
      "the same detection is stale once the guest reports it booted after it",
      isDetectionStale({ server, running: true, uptime: 0 }),
    );
  }

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
  );
  console.log("    clean:  bun script dev/verify-guest-os --cleanup\n");

  process.exit(failures === 0 ? 0 : 1);
}

async function readServer() {
  const [row] = await db
    .select({
      id: servers.id,
      detectedOsId: servers.detectedOsId,
      detectedOsName: servers.detectedOsName,
      detectedOsVersion: servers.detectedOsVersion,
      detectedOsKernel: servers.detectedOsKernel,
      detectedOsAt: servers.detectedOsAt,
    })
    .from(servers)
    .where(eq(servers.id, SERVER_ID))
    .limit(1);

  if (!row) throw new Error("server row disappeared");

  return row;
}

async function waitForTask(
  instance: ReturnType<typeof getProxmoxInstance>,
  upid: string,
) {
  for (let i = 0; i < 900; i++) {
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
  await db.delete(servers).where(eq(servers.id, SERVER_ID));

  const nodes = await db.select().from(proxmoxNodes);

  for (const node of nodes) {
    const instance = getProxmoxInstance(node);

    const guests = await instance.node.qemu.$get().catch(() => []);

    for (const guest of guests.filter((g) => g.name === GUEST_NAME)) {
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

  // Deleted by group name rather than by id: the name is unique and stable,
  // so a run whose ids were changed still clears what an earlier run left.
  const [group] = await db
    .select()
    .from(proxmoxTemplateGroups)
    .where(eq(proxmoxTemplateGroups.name, GROUP_NAME));

  if (group) {
    const templates = await db
      .select()
      .from(proxmoxTemplates)
      .where(eq(proxmoxTemplates.proxmoxTemplateGroupId, group.id));

    for (const template of templates) {
      await db
        .delete(proxmoxTemplateImages)
        .where(eq(proxmoxTemplateImages.proxmoxTemplateId, template.id));
      await db
        .delete(proxmoxTemplates)
        .where(eq(proxmoxTemplates.id, template.id));
    }

    await db
      .delete(proxmoxTemplateGroups)
      .where(eq(proxmoxTemplateGroups.id, group.id));
  }
}

await main();
