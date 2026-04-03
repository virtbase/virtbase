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
import { and, eq, isNotNull } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, serverBackups, servers } from "@virtbase/db/schema";
import { sleep } from "bun";

/**
 * The maximum number of servers to delete without any safety checks.
 * This is to prevent accidental deletion of all servers on a real node.
 */
const MAX_SAFE_DEV_SERVERS = 10;

/**
 * Script that deletes all dev servers on all currently stored nodes.
 * This script looks for servers that start with "vb-dev" and deletes them.
 */
async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "This script is intended to be run in development mode only.",
    );
  }

  const nodes = await db
    .selectDistinctOn([proxmoxNodes.hostname], {
      id: proxmoxNodes.id,
      hostname: proxmoxNodes.hostname,
      fqdn: proxmoxNodes.fqdn,
      tokenID: proxmoxNodes.tokenID,
      tokenSecret: proxmoxNodes.tokenSecret,
    })
    .from(proxmoxNodes);

  await Promise.all(
    nodes.map(async (node) => {
      const instance = getProxmoxInstance(node);
      const guests = await instance.node.qemu.$get();

      const filtered = guests.filter(
        (guest) => !!guest.name && guest.name.startsWith("vb-dev"),
      );

      if (0 === filtered.length) {
        console.log(`[${node.hostname}] No dev servers found, skipping...`);
        return;
      }

      if (MAX_SAFE_DEV_SERVERS < filtered.length) {
        console.error(
          `[${node.hostname}] Found ${filtered.length} dev servers, which is more than the allowed limit of ${MAX_SAFE_DEV_SERVERS}.`,
          "Exiting for safety reasons, increase the limit if you know what you are doing.",
        );

        process.exit(1);
      }

      console.log(
        `[${node.hostname}] Found ${filtered.length} dev servers, shutting down...`,
      );

      await instance.cluster["bulk-action"].guest.shutdown.$post({
        "force-stop": true,
        maxworkers: 10,
        timeout: 10_000,
        vms: filtered.map((guest) => guest.vmid),
      });

      console.log(
        `[${node.hostname}] Waiting for 10 seconds before deleting...`,
      );

      await sleep(10_000);

      await Promise.all(
        filtered.map(async (guest) => {
          const backups = await db
            .select({
              volid: serverBackups.volid,
              isLocked: serverBackups.isLocked,
            })
            .from(serverBackups)
            .innerJoin(
              servers,
              and(
                eq(serverBackups.serverId, servers.id),
                eq(servers.vmid, guest.vmid),
              ),
            )
            .where(isNotNull(serverBackups.finishedAt));

          // Delete the guest
          await instance.node.qemu.$(guest.vmid).$delete({
            "destroy-unreferenced-disks": true,
            purge: true,
          });

          // Delete the backups
          await Promise.all(
            backups.map(async (backup) => {
              if (!backup.volid) {
                return;
              }

              const [storage] = backup.volid.split(":");
              if (!storage) {
                return;
              }

              if (backup.isLocked) {
                await instance.node.storage
                  .$(storage)
                  .content.$(backup.volid)
                  .$put({
                    protected: false,
                    notes: "Safe to delete - development server backup",
                  });
              }

              await instance.node.storage
                .$(storage)
                .content.$(backup.volid)
                .$delete();
            }),
          );

          await db.delete(servers).where(eq(servers.vmid, guest.vmid));
        }),
      );
    }),
  );

  process.exit(0);
}

void main();
