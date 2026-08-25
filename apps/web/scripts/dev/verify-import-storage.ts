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
import { db } from "@virtbase/db/client";
import { proxmoxNodes } from "@virtbase/db/schema";

/**
 * Exercises the import-storage path against the local cluster, end to end:
 * a node row's `importStorage`, the `downloadUrl` helper's re-declared
 * `content: "import"`, checksum enforcement, and the content listing that
 * freshness checks will read.
 *
 * Uses CirrOS (~21 MB) rather than a real distro image so it costs seconds.
 * Note the stored filename ends in `.qcow2` while the source URL ends in
 * `.img` - Proxmox rejects `.img` as import content, and this is exactly the
 * rename the template code will have to do for Ubuntu.
 *
 *   bun script dev/verify-import-storage
 */
const IMAGE_URL =
  "https://download.cirros-cloud.net/0.6.2/cirros-0.6.2-x86_64-disk.img";
/** The image's real digest, so the positive case verifies rather than skips. */
const IMAGE_SHA256 =
  "07e44a73e54c94d988028515403c1ed762055e01b83a767edf3c2b387f78ce00";
/** Deliberately not the image's digest, to prove a mismatch is rejected. */
const WRONG_SHA256 =
  "b58e2d7b5c0e1c6dd0e3ddbaef47a2e1ba7c0b93de7ba2f7cb2d0bb1b6e4d6f0";
const FILENAME = "temp_VERIFYIMPORT-cirros062.qcow2";

async function main() {
  const [node] = await db
    .select({
      id: proxmoxNodes.id,
      hostname: proxmoxNodes.hostname,
      fqdn: proxmoxNodes.fqdn,
      tokenID: proxmoxNodes.tokenID,
      tokenSecret: proxmoxNodes.tokenSecret,
      importStorage: proxmoxNodes.importStorage,
    })
    .from(proxmoxNodes)
    .limit(1);

  if (!node) {
    console.error("no proxmox node registered - run `bun script dev/cluster`");
    process.exit(1);
  }

  console.log(`node ${node.hostname}, import storage ${node.importStorage}`);

  const instance = getProxmoxInstance(node);

  // 1. A wrong checksum must fail the task rather than land a bad image.
  console.log("\n[1] deliberately wrong checksum (must fail)");
  const badUpid = await instance.downloadUrl({
    storage: node.importStorage,
    content: "import",
    filename: "temp_VERIFYIMPORT-badsum.qcow2",
    url: IMAGE_URL,
    checksum: WRONG_SHA256,
    checksumAlgorithm: "sha256",
  });
  const bad = await waitForTask(instance, badUpid);
  console.log(`    exitstatus: ${bad}`);
  if (bad === "OK") {
    console.error("    UNEXPECTED: a wrong checksum was accepted");
    process.exit(1);
  }

  // 2. The correct checksum must succeed, and be listed as import content.
  console.log("\n[2] correct checksum (must succeed)");
  const upid = await instance.downloadUrl({
    storage: node.importStorage,
    content: "import",
    filename: FILENAME,
    url: IMAGE_URL,
    checksum: IMAGE_SHA256,
    checksumAlgorithm: "sha256",
  });
  const ok = await waitForTask(instance, upid);
  console.log(`    exitstatus: ${ok}`);
  if (ok !== "OK") {
    console.error("    UNEXPECTED: download failed");
    process.exit(1);
  }

  const contents = await instance.node.storage
    .$(node.importStorage)
    .content.$get({ content: "import" });

  console.log("\n[3] import content listing");
  for (const item of contents) {
    console.log(
      `    ${item.volid}  ${item.format}  ${item.size} bytes  ctime=${item.ctime}`,
    );
  }

  const found = contents.find((c) => c.volid.endsWith(FILENAME));
  if (!found) {
    console.error("    UNEXPECTED: downloaded volume is not listed");
    process.exit(1);
  }

  // Leave nothing behind - this is a probe, not a cache warm.
  await instance.node.storage
    .$(node.importStorage)
    .content.$(found.volid)
    .$delete();
  console.log(`\ncleaned up ${found.volid}`);
  console.log("\nOK - import storage path verified end to end");
}

async function waitForTask(
  instance: ReturnType<typeof getProxmoxInstance>,
  upid: string,
): Promise<string> {
  for (let i = 0; i < 120; i++) {
    const status = await instance.node.tasks.$(upid).status.$get();
    if (status.status === "stopped") return status.exitstatus ?? "unknown";
    await new Promise((r) => setTimeout(r, 1000));
  }
  return "timeout";
}

await main();
process.exit(0);
