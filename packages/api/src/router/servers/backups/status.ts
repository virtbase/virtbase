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

import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "@virtbase/db";
import { serverBackups } from "@virtbase/db/schema";
import {
  GetServerBackupStatusInputSchema,
  GetServerBackupStatusOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../../trpc";

export const serversBackupsStatusRouter = createTRPCRouter({
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

      const where = and(
        eq(serverBackups.id, input.backup_id),
        // [!] Authorization: Only allow the user to access their own backups
        eq(serverBackups.serverId, server.id),
      );

      const backup = await db.transaction(
        async (tx) => {
          return tx
            .select({
              id: serverBackups.id,
              upid: serverBackups.upid,
              startedAt: serverBackups.startedAt,
              failedAt: serverBackups.failedAt,
              finishedAt: serverBackups.finishedAt,
            })
            .from(serverBackups)
            .where(where)
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

      if (backup.finishedAt) {
        // Backup is already finished
        return {
          status: {
            started_at: backup.startedAt,
            failed_at: backup.failedAt,
            finished_at: backup.finishedAt,
            percentage: null,
          },
        };
      }

      const task = await instance.node.tasks.$(backup.upid).status.$get();

      if (task.status === "stopped") {
        if (task.exitstatus === "OK") {
          // Backup is finished successfully

          // Unfortunately there is no other way to get the volid currently
          // Retrieve the full list of backups and search for it...
          const content = await instance.node.storage
            .$(proxmoxNode.backupStorage)
            .content.$get({
              vmid: server.vmid,
              content: "backup",
            });

          const entry = content.find(
            (entry) => !!entry.notes && entry.notes.includes(server.id),
          );

          if (!entry) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          const updated = await db.transaction(
            async (tx) => {
              return tx
                .update(serverBackups)
                .set({
                  volid: entry.volid,
                  size: entry.size,
                  failedAt: null,
                  // Use the native creation time if we have it for accurate display
                  finishedAt: entry.ctime
                    ? new Date(entry.ctime * 1000)
                    : sql`now()`,
                })
                .where(where)
                .returning({
                  startedAt: serverBackups.startedAt,
                  finishedAt: serverBackups.finishedAt,
                  failedAt: serverBackups.failedAt,
                })
                .then(([row]) => row);
            },
            {
              accessMode: "read write",
              isolationLevel: "read committed",
            },
          );

          if (!updated) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          return {
            status: {
              started_at: updated.startedAt,
              failed_at: updated.failedAt,
              finished_at: updated.finishedAt,
              percentage: null,
            },
          };
        }

        // Any other exit status = backup failed
        const updated = await db.transaction(
          async (tx) => {
            return tx
              .update(serverBackups)
              .set({
                finishedAt: sql`now()`,
                failedAt: sql`now()`,
              })
              .where(where)
              .returning({
                startedAt: serverBackups.startedAt,
                failedAt: serverBackups.failedAt,
                finishedAt: serverBackups.finishedAt,
              })
              .then(([row]) => row);
          },
          {
            accessMode: "read write",
            isolationLevel: "read committed",
          },
        );

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
          });
        }

        return {
          status: {
            started_at: updated.startedAt,
            failed_at: updated.failedAt,
            finished_at: updated.finishedAt,
            percentage: null,
          },
        };
      }

      if (task.status === "running") {
        // Backup is still running

        const log = await instance.node.tasks.$(backup.upid).log.$get({
          download: false,
        });

        // Go through log lines in reverse order
        let percentage: number | null = null;
        for (let i = log.length - 1; i >= 0; i--) {
          const entry = log[i];
          if (!entry) continue;

          // Extract percentage from entry.t using regex
          // Example line: "INFO:   3% (385.0 MiB of 10.0 GiB) in 3s, read: 128.3 MiB/s, write: 50.9 MiB/s"
          const match = entry.t.match(/INFO:\s+(\d+)%/);
          if (match?.[1]) {
            percentage = parseInt(match[1], 10);
            break;
          }
        }

        // Backup is still running
        return {
          status: {
            percentage,
            started_at: backup.startedAt,
            finished_at: null,
            failed_at: null,
          },
        };
      }

      // Unhandled task status
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
      });
    }),
});
