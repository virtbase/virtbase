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
import { and, count, eq, isNull } from "@virtbase/db";
import { proxmoxTemplates, serverBackups } from "@virtbase/db/schema";
import { buildOrderBy, createId } from "@virtbase/db/utils";
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from "@virtbase/utils";
import { getPaginationMeta } from "@virtbase/validators";
import {
  CreateServerBackupInputSchema,
  CreateServerBackupOutputSchema,
  DeleteServerBackupInputSchema,
  DeleteServerBackupOutputSchema,
  GetServerBackupInputSchema,
  GetServerBackupOutputSchema,
  ListServerBackupsInputSchema,
  ListServerBackupsOutputSchema,
  RestoreServerBackupInputSchema,
  RestoreServerBackupOutputSchema,
  UpdateServerBackupInputSchema,
  UpdateServerBackupOutputSchema,
} from "@virtbase/validators/server";
import { start } from "workflow/api";
import { createTRPCRouter, serverProcedure } from "../../../trpc";
import { restoreServerBackupWorkflow } from "../../../workflows";

export const serversBackupsRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/backups/{backup_id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Backups"],
        summary: "Get a backup",
        description: "Returns a specific backup by its unique identifier.",
      },
      permissions: {
        backups: ["read"],
      },
    })
    .input(GetServerBackupInputSchema)
    .output(GetServerBackupOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db } = ctx;

      const backup = await db.transaction(
        async (tx) => {
          return tx
            .select({
              id: serverBackups.id,
              name: serverBackups.name,
              is_locked: serverBackups.isLocked,
              size: serverBackups.size,
              started_at: serverBackups.startedAt,
              failed_at: serverBackups.failedAt,
              finished_at: serverBackups.finishedAt,
              template: !input.expand.includes("template")
                ? serverBackups.proxmoxTemplateId
                : {
                    id: proxmoxTemplates.id,
                    icon: proxmoxTemplates.icon,
                    name: proxmoxTemplates.name,
                  },
            })
            .from(serverBackups)
            .leftJoin(
              proxmoxTemplates,
              eq(serverBackups.proxmoxTemplateId, proxmoxTemplates.id),
            )
            .where(
              and(
                eq(serverBackups.id, input.backup_id),
                // [!] Authorization: Only allow the user to access their own backups
                eq(serverBackups.serverId, input.server_id),
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

      return {
        backup,
      };
    }),
  list: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/backups",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Backups"],
        summary: "List backups",
        description: "Returns a list of backups for a server.",
      },
      permissions: {
        backups: ["read"],
      },
    })
    .input(ListServerBackupsInputSchema)
    .output(ListServerBackupsOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db } = ctx;

      const page = input.page ?? DEFAULT_PAGE;
      const perPage = input.per_page ?? DEFAULT_PER_PAGE;

      const where = and(
        // [!] Authorization: Only allow the user to access their own backups
        eq(serverBackups.serverId, input.server_id),
        // Filters
        input.name ? eq(serverBackups.name, input.name) : undefined,
      );

      const orderBy = buildOrderBy(serverBackups, input.sort, serverBackups.id);

      const offset = (page - 1) * perPage;

      const { data, total } = await db.transaction(
        async (tx) => {
          const data = await tx
            .select({
              id: serverBackups.id,
              name: serverBackups.name,
              is_locked: serverBackups.isLocked,
              size: serverBackups.size,
              started_at: serverBackups.startedAt,
              failed_at: serverBackups.failedAt,
              finished_at: serverBackups.finishedAt,
              template: !input.expand.includes("template")
                ? serverBackups.proxmoxTemplateId
                : {
                    id: proxmoxTemplates.id,
                    icon: proxmoxTemplates.icon,
                    name: proxmoxTemplates.name,
                  },
            })
            .from(serverBackups)
            .limit(perPage)
            .offset(offset)
            .where(where)
            .orderBy(...orderBy);

          const total = await tx
            .select({ count: count() })
            .from(serverBackups)
            .where(where)
            .execute()
            .then(([res]) => res?.count ?? 0);

          return { data, total };
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      return {
        backups: data.map((item) => ({
          id: item.id,
          name: item.name,
          is_locked: item.is_locked,
          size: item.size,
          started_at: item.started_at,
          failed_at: item.failed_at,
          finished_at: item.finished_at,
          template: item.template,
        })),
        meta: {
          pagination: getPaginationMeta({
            total,
            page,
            perPage,
          }),
        },
      };
    }),
  create: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/backups",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Backups"],
        summary: "Create a backup",
        description: "Creates a new backup for a server.",
      },
      permissions: {
        backups: ["write"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
      ratelimit: {
        requests: 5,
        seconds: "1 d",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `create-server-backup:${userId || defaultFingerprint}`,
      },
    })
    .input(CreateServerBackupInputSchema)
    .output(CreateServerBackupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, instance, proxmoxNode, server } = ctx;

      const created = await db.transaction(
        async (tx) => {
          const runningJobsCount = await tx.$count(
            serverBackups,
            and(
              eq(serverBackups.serverId, server.id),
              isNull(serverBackups.finishedAt),
            ),
          );

          if (runningJobsCount > 0) {
            throw new TRPCError({
              code: "CONFLICT",
            });
          }

          const newBackupId = createId({
            prefix: "kbu_",
          });

          const upid = await instance.node.vzdump.$post({
            // Important: Only backup this specific VM!
            // If omitted, all VMs on the host node will be backed up
            vmid: `${server.vmid}`,
            // Limit the backup speed to 1250 MB/s (10 Gbit/s)
            // 125 MB/s = around 120 MiB/s
            bwlimit: 10 * 120 * 1024, // Number in KiB/s
            // Priority = best effort (7) - current default in Proxmox
            ionice: 7,
            mode: input.mode,
            // Compress the backup with zstd - fast and good compression ratio
            compress: "zstd",
            // Wait up to 180 minutes for the global lock
            lockwait: 180,
            // Even if a `prune-backups` rule is created, don't remove the older backups
            remove: false,
            // Store the backup onto this storage
            storage: proxmoxNode.backupStorage,
            "notes-template": `Created by Virtbase system - server_id: ${input.server_id}, backup_id: ${newBackupId}, vmid: {{vmid}}`,
            // Don't stop other running backup jobs
            stop: false,
            protected: input.is_locked,
            quiet: true,
          });

          const created = await tx
            .insert(serverBackups)
            .values({
              id: newBackupId,
              serverId: server.id,
              name: input.name,
              isLocked: input.is_locked,
              upid,
              proxmoxTemplateId:
                typeof server.template === "string" || server.template === null
                  ? server.template
                  : server.template.id,
            })
            .returning({
              id: serverBackups.id,
              name: serverBackups.name,
              is_locked: serverBackups.isLocked,
              size: serverBackups.size,
              started_at: serverBackups.startedAt,
              failed_at: serverBackups.failedAt,
              finished_at: serverBackups.finishedAt,
              template: serverBackups.proxmoxTemplateId,
            })
            .then(([row]) => row);

          if (!created) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          return created;
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      return {
        backup: created,
      };
    }),
  update: serverProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/servers/{server_id}/backups/{backup_id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Backups"],
        summary: "Update a backup",
        description: "Updates a specific backup by its unique identifier.",
      },
      permissions: {
        backups: ["update"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
    })
    .input(UpdateServerBackupInputSchema)
    .output(UpdateServerBackupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, instance } = ctx;

      const updated = await db.transaction(
        async (tx) => {
          const current = await tx
            .select({
              isLocked: serverBackups.isLocked,
              volid: serverBackups.volid,
              finishedAt: serverBackups.finishedAt,
              failedAt: serverBackups.failedAt,
            })
            .from(serverBackups)
            .where(
              and(
                eq(serverBackups.id, input.backup_id),
                // [!] Authorization: Only allow the user to access their own backups
                eq(serverBackups.serverId, input.server_id),
              ),
            )
            .limit(1)
            .then(([row]) => row);

          if (!current) {
            throw new TRPCError({
              code: "NOT_FOUND",
            });
          }

          if (
            input.is_locked !== undefined &&
            input.is_locked !== current.isLocked
          ) {
            // Lock status changed
            if (!current.finishedAt || current.failedAt || !current.volid) {
              throw new TRPCError({
                code: "BAD_REQUEST",
              });
            }

            const [storage] = current.volid.split(":");
            if (!storage) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
              });
            }

            // Update lock status in Proxmox
            // Use $put for synchronous update
            await instance.node.storage
              .$(storage)
              .content.$(current.volid)
              .$put({
                protected: input.is_locked,
              });
          }

          const updated = await tx
            .update(serverBackups)
            .set({
              name: input.name,
              isLocked: input.is_locked,
            })
            .where(
              and(
                eq(serverBackups.id, input.backup_id),
                // [!] Authorization: Only allow the user to access their own backups
                eq(serverBackups.serverId, input.server_id),
              ),
            )
            .returning({
              id: serverBackups.id,
              name: serverBackups.name,
              is_locked: serverBackups.isLocked,
              size: serverBackups.size,
              started_at: serverBackups.startedAt,
              failed_at: serverBackups.failedAt,
              finished_at: serverBackups.finishedAt,
              template: serverBackups.proxmoxTemplateId,
            })
            .then(([row]) => row);

          if (!updated) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          return updated;
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      return {
        backup: updated,
      };
    }),
  delete: serverProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/servers/{server_id}/backups/{backup_id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Backups"],
        summary: "Delete a backup",
        description: "Deletes a specific backup by its unique identifier.",
      },
      permissions: {
        backups: ["write"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
    })
    .input(DeleteServerBackupInputSchema)
    .output(DeleteServerBackupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, instance } = ctx;

      await db.transaction(
        async (tx) => {
          const backup = await tx
            .delete(serverBackups)
            .where(
              and(
                eq(serverBackups.id, input.backup_id),
                // [!] Authorization: Only allow the user to access their own backups
                eq(serverBackups.serverId, input.server_id),
              ),
            )
            .returning({
              volid: serverBackups.volid,
              finishedAt: serverBackups.finishedAt,
              failedAt: serverBackups.failedAt,
              isLocked: serverBackups.isLocked,
            })
            .then(([backup]) => backup);

          if (!backup) {
            throw new TRPCError({
              code: "NOT_FOUND",
            });
          }

          if (!backup.finishedAt || !backup.volid || backup.isLocked) {
            throw new TRPCError({
              code: "BAD_REQUEST",
            });
          }

          if (backup.failedAt) {
            // Backup failed, no need to delete it in Proxmox
            return;
          }

          const [storage] = backup.volid.split(":");
          if (!storage) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          // Asynchronous API, operation may fail, but we are not notified
          await instance.node.storage
            .$(storage)
            .content.$(backup.volid)
            .$delete({
              delay: 0,
            });
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );
    }),
  restore: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/backups/{backup_id}/restore",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Backups"],
        summary: "Restore a backup",
        description: "Restores a specific backup by its unique identifier.",
      },
      permissions: {
        backups: ["write"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
      ratelimit: {
        requests: 5,
        seconds: "1 d",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `restore-server-backup:${userId || defaultFingerprint}`,
      },
    })
    .input(RestoreServerBackupInputSchema)
    .output(RestoreServerBackupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, server, instance, proxmoxNode } = ctx;

      const backup = await db.transaction(
        async (tx) => {
          return tx
            .select({
              id: serverBackups.id,
              finishedAt: serverBackups.finishedAt,
              failedAt: serverBackups.failedAt,
              volid: serverBackups.volid,
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

      if (!backup.finishedAt || !backup.volid || backup.failedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
        });
      }

      const tasks = await instance.node.tasks.$get({
        vmid: server.vmid,
        limit: 5,
        source: "active",
        errors: false,
      });

      const hasActiveBackupTask = tasks.some(
        (task) =>
          task.status === "RUNNING" &&
          (task.type === "vzdump" || task.type === "vzrestore"),
      );

      if (hasActiveBackupTask) {
        throw new TRPCError({
          code: "CONFLICT",
        });
      }

      await start(restoreServerBackupWorkflow, [
        {
          proxmoxNode,
          vmid: server.vmid,
          volid: backup.volid,
        },
      ]);
    }),
});
