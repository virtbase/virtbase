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

import type { SortableColumns } from "@virtbase/db/utils";
import * as z from "zod";
import { PaginationSchema } from "../pagination";
import { ProxmoxTemplateSchema } from "../proxmox-template";
import {
  EXAMPLE_DATE,
  ObjectTimestampSchema,
  RFC3339LINK,
} from "../timestamps";
import { preprocessQueryArray } from "../utils";
import { ServerSchema } from "./shared";

export const ServerBackupSchema = z.object({
  id: z
    .string()
    .regex(/^kbu_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the backup.",
      example: "kbu_1KECN6RQ2MHEMQV0E62050P88",
    }),
  server_id: ServerSchema.shape.id,
  // proxmoxTemplateId placeholder
  name: z
    .string()
    .min(1)
    .max(64)
    .meta({
      description: "User-defined display name of the backup.",
      examples: ["Backup 1"],
    }),
  is_locked: z.boolean().meta({
    description: "Whether the backup is locked and cannot be deleted.",
    example: true,
  }),
  volid: z
    .string()
    // <storage>:<content_type>/vzdump-<vm_type>-<vm_id>-<date_string>.<format>
    .regex(/^.*:.*\/vzdump-.*-.*-.*\..*$/)
    .nullable()
    .meta({
      description: "Proxmox volume identifier of the backup.",
      examples: ["local:data/vzdump-qemu-1000-2026-01-01-00-00-00.raw"],
    }),
  size: z
    .number()
    .positive()
    .nullable()
    .meta({
      description:
        "Size of the backup in bytes. Only set if the backup was successful.",
      examples: [1024 * 1024 * 1024],
    }),
  upid: z
    .string()
    .nullable()
    .meta({
      description: "Proxmox UPID of the backup task.",
      examples: ["UPID:node01:001B1457:1932CEC5:695D69C3:vzdump::user@pve:"],
    }),
  started_at: z.date().meta({
    description: `Start timestamp of the backup task ${RFC3339LINK}.`,
    examples: [EXAMPLE_DATE],
  }),
  failed_at: z
    .date()
    .nullable()
    .meta({
      description: `Failure timestamp of the backup task, if it failed ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  finished_at: z
    .date()
    .nullable()
    .meta({
      description: `Completion timestamp of the backup task for any status ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type ServerBackup = z.infer<typeof ServerBackupSchema>;

const ServerBackupExpandSchema = z.enum(["template"]).array().default([]);

const ServerBackupTemplateField = z
  .union([
    ProxmoxTemplateSchema.shape.id,
    ProxmoxTemplateSchema.pick({
      id: true,
      icon: true,
      name: true,
    }).meta({
      description:
        "Only present if the `template` expand is included. The template at the time of the backup.",
    }),
  ])
  .nullable();

export const GetServerBackupInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  backup_id: ServerBackupSchema.shape.id,
  expand: z.preprocess(
    preprocessQueryArray,
    ServerBackupExpandSchema,
  ) as unknown as typeof ServerBackupExpandSchema,
});

export type GetServerBackupInput = z.infer<typeof GetServerBackupInputSchema>;

export const GetServerBackupOutputSchema = z.object({
  backup: ServerBackupSchema.pick({
    id: true,
    name: true,
    is_locked: true,
    size: true,
    started_at: true,
    failed_at: true,
    finished_at: true,
  }).extend({
    template: ServerBackupTemplateField,
  }),
});

export type GetServerBackupOutput = z.infer<typeof GetServerBackupOutputSchema>;

const sortSchema = z
  .enum<SortableColumns<ServerBackup>>([
    "id",
    "id:asc",
    "id:desc",
    "name",
    "name:asc",
    "name:desc",
    "size",
    "size:asc",
    "size:desc",
  ])
  .array()
  .default(["id:desc"]);

export const ListServerBackupsInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  // Required for trpc-to-openapi to work correctly
  sort: z.preprocess(
    preprocessQueryArray,
    sortSchema,
  ) as unknown as typeof sortSchema,
  expand: z.preprocess(
    preprocessQueryArray,
    ServerBackupExpandSchema,
  ) as unknown as typeof ServerBackupExpandSchema,
  name: ServerBackupSchema.shape.name.optional(),
  page: PaginationSchema.shape.page,
  per_page: PaginationSchema.shape.per_page,
});

export type ListServerBackupsInput = z.infer<
  typeof ListServerBackupsInputSchema
>;

export const ListServerBackupsOutputSchema = z.object({
  backups: z.array(
    ServerBackupSchema.pick({
      id: true,
      name: true,
      is_locked: true,
      size: true,
      started_at: true,
      failed_at: true,
      finished_at: true,
    }).extend({
      template: ServerBackupTemplateField,
    }),
  ),
  meta: z.object({
    pagination: PaginationSchema,
  }),
});

export type ListServerBackupsOutput = z.infer<
  typeof ListServerBackupsOutputSchema
>;

export const CreateServerBackupInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  name: ServerBackupSchema.shape.name,
  is_locked: ServerBackupSchema.shape.is_locked.optional(),
  mode: z.enum(["snapshot", "suspend", "stop"]),
});

export type CreateServerBackupInput = z.infer<
  typeof CreateServerBackupInputSchema
>;

export const CreateServerBackupOutputSchema = GetServerBackupOutputSchema;

export type CreateServerBackupOutput = z.infer<
  typeof CreateServerBackupOutputSchema
>;

export const DeleteServerBackupInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  backup_id: ServerBackupSchema.shape.id,
});

export type DeleteServerBackupInput = z.infer<
  typeof DeleteServerBackupInputSchema
>;

export const DeleteServerBackupOutputSchema = z.void();

export type DeleteServerBackupOutput = z.infer<
  typeof DeleteServerBackupOutputSchema
>;

export const UpdateServerBackupInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  backup_id: ServerBackupSchema.shape.id,
  name: ServerBackupSchema.shape.name.optional(),
  is_locked: ServerBackupSchema.shape.is_locked.optional(),
});

export type UpdateServerBackupInput = z.infer<
  typeof UpdateServerBackupInputSchema
>;

export const UpdateServerBackupOutputSchema = GetServerBackupOutputSchema;

export const RestoreServerBackupInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  backup_id: ServerBackupSchema.shape.id,
});

export type RestoreServerBackupInput = z.infer<
  typeof RestoreServerBackupInputSchema
>;

export const RestoreServerBackupOutputSchema = z.void();

export const GetServerBackupStatusInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  backup_id: ServerBackupSchema.shape.id,
});

export type GetServerBackupStatusInput = z.infer<
  typeof GetServerBackupStatusInputSchema
>;

export const GetServerBackupStatusOutputSchema = z.object({
  status: ServerBackupSchema.pick({
    started_at: true,
    failed_at: true,
    finished_at: true,
  }).extend({
    percentage: z
      .number()
      .int()
      .min(0)
      .max(100)
      .nullable()
      .meta({
        description:
          "The current percentage of the backup that has been completed. This value is only available while the backup process is running.",
        examples: [0, 10, 50, 100],
      }),
  }),
});
