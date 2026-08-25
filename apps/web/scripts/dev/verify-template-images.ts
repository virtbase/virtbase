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

import { refreshTemplateImages } from "@virtbase/api/template-images";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes,
  proxmoxTemplateGroups,
  proxmoxTemplateImages,
  proxmoxTemplates,
} from "@virtbase/db/schema";

/**
 * Exercises the whole Phase 2 image lifecycle against the local cluster.
 *
 * The interesting assertion is the second pass: the dev cluster's three nodes
 * all point at the same shared CephFS, so a naive implementation downloads the
 * same image three times. This asserts one download and two adoptions, then
 * that a repeat run is free.
 *
 *   bun script dev/verify-template-images
 */
const GROUP_ID = "ptg_0000000000000000000000009";
const TEMPLATE_ID = "temp_000000000000000000000009";

// CirrOS: small enough that the whole check runs in seconds.
const IMAGE_URL =
  "https://download.cirros-cloud.net/0.6.2/cirros-0.6.2-x86_64-disk.img";
const IMAGE_SHA256 =
  "07e44a73e54c94d988028515403c1ed762055e01b83a767edf3c2b387f78ce00";

async function main() {
  await cleanup();

  await db.insert(proxmoxTemplateGroups).values({
    id: GROUP_ID,
    name: "__verify-template-images",
  });
  await db.insert(proxmoxTemplates).values({
    id: TEMPLATE_ID,
    proxmoxTemplateGroupId: GROUP_ID,
    name: "CirrOS 0.6.2 (verification)",
    enabled: true,
    imageUrl: IMAGE_URL,
    imageChecksum: IMAGE_SHA256,
    imageChecksumAlgorithm: "sha256",
    osFamily: "alpine",
    osVersion: "0.6.2",
  });

  const nodes = await db.select().from(proxmoxNodes);
  console.log(`${nodes.length} node(s) registered\n`);

  const downloadTasksBefore = await countDownloadTasks(nodes);

  // Pass 1: cold. Starts one download; the remaining nodes have nothing to
  // adopt yet because the download has not finished.
  console.log("[1] cold pass");
  console.log("   ", await refreshTemplateImages({ db }));

  // Pass 2..n: settle the download, then adopt on the other nodes.
  for (let i = 2; i <= 12; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const result = await refreshTemplateImages({ db });
    console.log(`[${i}] ${JSON.stringify(result)}`);

    if (result.ready === nodes.length) break;
  }

  const rows = await db
    .select({
      proxmoxNodeId: proxmoxTemplateImages.proxmoxNodeId,
      volid: proxmoxTemplateImages.volid,
      downloadedAt: proxmoxTemplateImages.downloadedAt,
      failedAt: proxmoxTemplateImages.failedAt,
      lastError: proxmoxTemplateImages.lastError,
      sizeBytes: proxmoxTemplateImages.sizeBytes,
    })
    .from(proxmoxTemplateImages)
    .where(eq(proxmoxTemplateImages.proxmoxTemplateId, TEMPLATE_ID));

  console.log("\n[rows]");
  for (const row of rows) {
    console.log(
      `    ${row.proxmoxNodeId}  ${row.volid}  ${
        row.downloadedAt ? "ready" : (row.lastError ?? "pending")
      }  ${row.sizeBytes ?? "-"} bytes`,
    );
  }

  const ready = rows.filter((r) => r.downloadedAt);
  const distinctVolids = new Set(rows.map((r) => r.volid));

  console.log("\n[assertions]");
  assert(
    rows.length === nodes.length,
    `one row per node (${rows.length}/${nodes.length})`,
  );
  assert(
    ready.length === nodes.length,
    `every row settled ready (${ready.length}/${nodes.length})`,
  );
  assert(
    distinctVolids.size === 1,
    `all nodes share one volume on the shared storage (${distinctVolids.size} distinct)`,
  );

  // A repeat pass must be free: everything fresh, nothing downloaded.
  const repeat = await refreshTemplateImages({ db });
  assert(
    repeat.ready === nodes.length && repeat.downloading === 0,
    `a repeat pass is a no-op (${JSON.stringify(repeat)})`,
  );

  // The assertion that actually matters on a shared storage: Proxmox itself
  // must show exactly one download task, not one per node. The `downloading`
  // counter above cannot show this - it counts statuses, and a node that is
  // waiting for another node's download also reports `downloading`.
  const downloads = (await countDownloadTasks(nodes)) - downloadTasksBefore;
  assert(
    downloads === 1,
    `exactly one download task on the cluster (saw ${downloads})`,
  );

  await cleanup();
  console.log("\nOK - template image lifecycle verified end to end");
}

/**
 * Counts `download` tasks across the cluster that concern this template's
 * image, as Proxmox recorded them.
 */
async function countDownloadTasks(
  nodes: (typeof proxmoxNodes.$inferSelect)[],
): Promise<number> {
  const { getProxmoxInstance } = await import("@virtbase/api/proxmox");
  const seen = new Set<string>();

  for (const node of nodes) {
    try {
      const tasks = await getProxmoxInstance(node).node.tasks.$get({
        limit: 500,
        typefilter: "download",
      });

      for (const task of tasks) {
        if (task.id?.includes(TEMPLATE_ID)) seen.add(task.upid);
      }
    } catch {
      // Unreachable node - the others still answer.
    }
  }

  return seen.size;
}

let failures = 0;
function assert(condition: boolean, description: string) {
  console.log(`    ${condition ? "PASS" : "FAIL"}  ${description}`);
  if (!condition) failures++;
}

async function cleanup() {
  // Remove the downloaded volume from the storage as well as the rows, so a
  // re-run genuinely starts cold.
  const rows = await db
    .select({
      volid: proxmoxTemplateImages.volid,
      proxmoxNodeId: proxmoxTemplateImages.proxmoxNodeId,
      storage: proxmoxTemplateImages.storage,
    })
    .from(proxmoxTemplateImages)
    .where(eq(proxmoxTemplateImages.proxmoxTemplateId, TEMPLATE_ID));

  if (rows.length > 0) {
    const { getProxmoxInstance } = await import("@virtbase/api/proxmox");
    const seen = new Set<string>();

    for (const row of rows) {
      if (seen.has(row.volid)) continue;
      seen.add(row.volid);

      const [node] = await db
        .select()
        .from(proxmoxNodes)
        .where(eq(proxmoxNodes.id, row.proxmoxNodeId))
        .limit(1);
      if (!node) continue;

      try {
        await getProxmoxInstance(node)
          .node.storage.$(row.storage)
          .content.$(row.volid)
          .$delete();
      } catch {
        // Already gone, or the node is unreachable - not worth failing on.
      }
    }
  }

  await db.delete(proxmoxTemplates).where(eq(proxmoxTemplates.id, TEMPLATE_ID));
  await db
    .delete(proxmoxTemplateGroups)
    .where(eq(proxmoxTemplateGroups.id, GROUP_ID));
}

await main();
process.exit(failures > 0 ? 1 : 0);
