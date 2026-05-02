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

import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "@virtbase/db";
import { proxmoxIsoDownloads as pids, servers } from "@virtbase/db/schema";
import {
  MountServerImageInputSchema,
  MountServerImageOutputSchema,
  UnmountServerImageInputSchema,
  UnmountServerImageOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../trpc";

export const serversMountsRouter = createTRPCRouter({
  mount: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/mount",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Mount an ISO image",
        description: "Mount a downloaded ISO image to a server.",
      },
      forbiddenStates: ["installing", "suspended", "terminated"],
      permissions: {
        servers: ["write"],
        iso: ["read"],
      },
    })
    .input(MountServerImageInputSchema)
    .output(MountServerImageOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, server, userId, instance, proxmoxNode } = ctx;

      try {
        await db.transaction(
          async (tx) => {
            const isoDownload = await tx
              .select({
                id: pids.id,
                finishedAt: pids.finishedAt,
                failedAt: pids.failedAt,
                expired: sql<boolean>`now() > ${pids.expiresAt}`,
              })
              .from(pids)
              .where(
                and(
                  eq(pids.id, input.iso_download_id),
                  // [!] Authorization: Only allow the user to access their own ISO image downloads
                  eq(pids.userId, userId),
                ),
              )
              .limit(1)
              .then(([row]) => row);

            if (!isoDownload) {
              throw new TRPCError({
                code: "NOT_FOUND",
              });
            }

            if (
              !isoDownload.finishedAt ||
              isoDownload.failedAt ||
              isoDownload.expired
            ) {
              throw new TRPCError({
                code: "BAD_REQUEST",
              });
            }

            const drive = "ide0";
            const storage = proxmoxNode.isoDownloadStorage;
            const volid = `${storage}:iso/${isoDownload.id}.iso`;

            // Synchronous update - effective on next boot
            await instance.vm.config.$put({
              [drive]: `${volid},media=cdrom`,
              boot: `order=${drive};scsi0`,
            });

            const updated = await tx
              .update(servers)
              .set({
                proxmoxIsoDownloadId: isoDownload.id,
              })
              .where(eq(servers.id, server.id))
              .returning({
                id: servers.id,
              })
              .then(([row]) => row);

            if (!updated) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
              });
            }
          },
          {
            accessMode: "read write",
            isolationLevel: "read committed",
          },
        );
      } catch (error) {
        Sentry.captureException(error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
  unmount: serverProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/servers/{server_id}/mount",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Unmount an ISO image",
        description: "Unmount a mounted ISO image from a server.",
      },
      forbiddenStates: ["installing", "suspended", "terminated"],
      permissions: {
        servers: ["write"],
        iso: ["read"],
      },
    })
    .input(UnmountServerImageInputSchema)
    .output(UnmountServerImageOutputSchema)
    .mutation(async ({ ctx }) => {
      const { db, server, instance } = ctx;

      try {
        await db.transaction(
          async (tx) => {
            if (!server.mount) {
              throw new TRPCError({
                code: "BAD_REQUEST",
              });
            }

            const updated = await tx
              .update(servers)
              .set({
                proxmoxIsoDownloadId: null,
              })
              .where(
                and(
                  // [!] Authorization: Only allow the user to access their own server mount
                  eq(servers.id, server.id),
                  eq(
                    servers.proxmoxIsoDownloadId,
                    typeof server.mount === "string"
                      ? server.mount
                      : server.mount.id,
                  ),
                ),
              )
              .returning({
                id: servers.id,
              })
              .then(([row]) => row);

            if (!updated) {
              // There was no mount to unmount
              throw new TRPCError({
                code: "BAD_REQUEST",
              });
            }

            // Synchronous update - effective on next boot
            await instance.vm.config.$put({ delete: "ide0" });
          },
          {
            accessMode: "read write",
            isolationLevel: "read committed",
          },
        );
      } catch (error) {
        Sentry.captureException(error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
});
