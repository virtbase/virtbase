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

import * as Sentry from "@sentry/nextjs";
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxIsoDownloads, servers } from "@virtbase/db/schema";
import type { NextRequest } from "next/server";

/**
 * Checks for expired ISO images and deletes them.
 */
export async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  console.log(
    "[CRON] Starting deletion of expired ISO images. Current time is:",
    new Date().toISOString(),
  );

  await db.transaction(
    async (tx) => {
      const expired = await tx.query.proxmoxIsoDownloads.findMany({
        columns: { id: true, upid: true, failedAt: true, finishedAt: true },
        where: {
          RAW: (t) => sql`${t.expiresAt} < now()`,
        },
        with: {
          proxmoxNode: {
            columns: {
              isoDownloadStorage: true,
              hostname: true,
              fqdn: true,
              // [!] Sensitive data
              tokenID: true,
              tokenSecret: true,
            },
          },
          servers: {
            columns: { id: true, vmid: true },
            with: {
              proxmoxNode: {
                columns: {
                  isoDownloadStorage: true,
                  hostname: true,
                  fqdn: true,
                  // [!] Sensitive data
                  tokenID: true,
                  tokenSecret: true,
                },
              },
            },
          },
        },
      });

      console.log(
        "[CRON] Found",
        expired.length,
        "expired ISO images to delete.",
      );

      await Promise.all(
        expired.map(async ({ proxmoxNode, ...item }) => {
          try {
            if (item.servers.length > 0) {
              // The ISO image is still in use, unlink it from the servers
              await Promise.all(
                item.servers.map(async ({ proxmoxNode, ...server }) => {
                  const instance = getProxmoxInstance(proxmoxNode);
                  const vm = instance.node.qemu.$(server.vmid);

                  // Synchronous update - effective on next boot
                  await vm.config.$put({ delete: "ide0" });
                }),
              );

              await tx
                .update(servers)
                .set({ proxmoxIsoDownloadId: null })
                .where(eq(servers.proxmoxIsoDownloadId, item.id));
            }

            if (!item.failedAt) {
              const instance = getProxmoxInstance(proxmoxNode);

              const storage = proxmoxNode.isoDownloadStorage;
              const volid = `${storage}:iso/${item.id}.iso`;

              try {
                await instance.node.tasks.$(item.upid).$delete();
              } catch {
                console.error(
                  `[CRON] Failed to delete ISO image ${item.id} task ${item.upid}`,
                );
              }

              try {
                await instance.node.storage
                  .$(storage)
                  .content.$(volid)
                  .$delete();
              } catch {
                console.error(
                  `[CRON] Failed to delete ISO image ${item.id} from storage ${storage}:iso/${item.id}.iso`,
                );
              }
            }

            await tx
              .delete(proxmoxIsoDownloads)
              .where(eq(proxmoxIsoDownloads.id, item.id));
          } catch (error) {
            console.error(
              `[CRON] Failed to delete expired ISO image ${item.id}:`,
              error,
            );

            Sentry.captureException(error);
          }
        }),
      );
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  return new Response("OK", {
    status: 200,
  });
}

export { handler as GET };
