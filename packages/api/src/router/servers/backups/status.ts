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

import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "@virtbase/db";
import { serverBackups } from "@virtbase/db/schema";
import {
  GetServerBackupStatusInputSchema,
  GetServerBackupStatusOutputSchema,
} from "@virtbase/validators/server";
import { reconcileServerBackup } from "../../../backups";
import { serverProcedure } from "../../../trpc";

export const serversBackupsStatusRouter = {
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/backups/{backup_id}/status",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Backups"],
        summary: "Get the status of a backup",
        description:
          "Returns the status of a specific backup by its unique identifier.",
      },
      permissions: {
        backups: ["read"],
      },
    })
    .input(GetServerBackupStatusInputSchema)
    .output(GetServerBackupStatusOutputSchema)
    .query(async ({ ctx, input }) => {
      const { server, db, instance, proxmoxNode } = ctx;

      const backup = await db.transaction(
        async (tx) => {
          return tx
            .select({
              id: serverBackups.id,
              serverId: serverBackups.serverId,
              upid: serverBackups.upid,
              startedAt: serverBackups.startedAt,
              failedAt: serverBackups.failedAt,
              finishedAt: serverBackups.finishedAt,
            })
            .from(serverBackups)
            .where(
              and(
                eq(serverBackups.id, input.backup_id),
                // [!] Authorization: Only allow the user to access their own backups
                eq(serverBackups.serverId, server.id),
              ),
            )
            .limit(1)
            .then(([row]) => row);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      if (!backup) {
        throw new TRPCError({
          code: "NOT_FOUND",
        });
      }

      const status = await reconcileServerBackup({
        db,
        instance,
        backupStorage: proxmoxNode.backupStorage,
        vmid: server.vmid,
        backup,
      });

      return {
        status: {
          started_at: status.startedAt,
          failed_at: status.failedAt,
          finished_at: status.finishedAt,
          percentage: status.percentage,
        },
      };
    }),
} satisfies TRPCRouterRecord;
