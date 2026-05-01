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
import { proxmoxIsoDownloads as pids, serverMounts } from "@virtbase/db/schema";
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
        path: "/servers/{server_id}/mounts",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Mount an ISO image",
        description: "Mount a downloaded ISO image to a server.",
      },
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

            const mounts = await tx.$count(
              serverMounts,
              eq(serverMounts.serverId, server.id),
            );
            if (mounts >= 2) {
              throw new TRPCError({
                code: "CONFLICT",
              });
            }

            const current = instance.vm.config.$get({
              current: true,
            });

            let drive: string | null = null;
            for (let i = 0; i < 4; i++) {
              const candidate = `ide${i}`;
              if (!(candidate in current)) {
                drive = candidate;
                break;
              }
            }

            if (!drive) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
              });
            }

            const storage = proxmoxNode.isoDownloadStorage;
            const volid = `${storage}:iso/${isoDownload.id}.iso`;

            // Synchronous update - effective on next boot
            await instance.vm.config.$put({
              [drive]: `${volid},media=cdrom`,
            });

            const inserted = await tx
              .insert(serverMounts)
              .values({
                serverId: server.id,
                isoDownloadId: isoDownload.id,
                drive,
              })
              .returning({
                id: serverMounts.id,
              })
              .then(([row]) => row);

            if (!inserted) {
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
        path: "/servers/{server_id}/mounts/{mount_id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Unmount an ISO image",
        description: "Unmount a mounted ISO image from a server.",
      },
      permissions: {
        servers: ["write"],
        iso: ["read"],
      },
    })
    .input(UnmountServerImageInputSchema)
    .output(UnmountServerImageOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, instance } = ctx;

      try {
        await db.transaction(
          async (tx) => {
            const deleted = await tx
              .delete(serverMounts)
              .where(
                and(
                  // [!] Authorization: Only allow the user to access their own server mounts
                  eq(serverMounts.serverId, input.server_id),
                  eq(serverMounts.id, input.mount_id),
                ),
              )
              .returning({
                id: serverMounts.id,
                drive: serverMounts.drive,
              })
              .then(([row]) => row);

            if (!deleted) {
              throw new TRPCError({
                code: "BAD_REQUEST",
              });
            }

            // Synchronous update - effective on next boot
            await instance.vm.config.$put({ delete: deleted.drive });
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
