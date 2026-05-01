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
import z from "zod";
import { PaginationSchema } from "./pagination";
import { EXAMPLE_DATE, ObjectTimestampSchema, RFC3339LINK } from "./timestamps";
import { preprocessQueryArray } from "./utils";

export const ProxmoxIsoDownloadSchema = z.object({
  id: z
    .string()
    .regex(/^iso_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the Proxmox ISO download.",
      examples: ["iso_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  // proxmox_node_id placeholder
  // user_id placeholder
  upid: z.string().meta({
    description: "The Proxmox UPID of the ISO image download task.",
  }),
  name: z
    .string()
    .min(1)
    .max(64)
    .meta({
      description: "The user-defined name of the ISO image.",
      examples: ["Debian 12 (Bookworm)"],
    }),
  url: z
    .url({
      protocol: /^https$/,
      hostname: z.regexes.domain,
    })
    .endsWith(".iso")
    .register(z.globalRegistry, {
      description: "The URL that was used to download the ISO image.",
      examples: ["https://example.com/debian-12-amd64.iso"],
    }),
  expires_at: z.date().meta({
    description: `The timestamp when the ISO image will expire ${RFC3339LINK}. After this timestamp, the ISO image can no longer be used and will be deleted soon.`,
    examples: [EXAMPLE_DATE],
  }),
  finished_at: z
    .date()
    .nullable()
    .meta({
      description: `Completion timestamp of the ISO image download task for any status ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE, null],
    }),
  failed_at: z
    .date()
    .nullable()
    .meta({
      description: `Failure timestamp of the ISO image download task, if it failed ${RFC3339LINK}.`,
      examples: [null, EXAMPLE_DATE],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type ProxmoxIsoDownload = z.infer<typeof ProxmoxIsoDownloadSchema>;

export const GetProxmoxIsoDownloadInputSchema = ProxmoxIsoDownloadSchema.pick({
  id: true,
});

export type GetProxmoxIsoDownloadInput = z.infer<
  typeof GetProxmoxIsoDownloadInputSchema
>;

export const GetProxmoxIsoDownloadOutputSchema = z.object({
  iso_download: ProxmoxIsoDownloadSchema.pick({
    id: true,
    name: true,
    url: true,
    expires_at: true,
    finished_at: true,
    failed_at: true,
    created_at: true,
    updated_at: true,
  }),
});

export type GetProxmoxIsoDownloadOutput = z.infer<
  typeof GetProxmoxIsoDownloadOutputSchema
>;

const sortSchema = z
  .enum<SortableColumns<ProxmoxIsoDownload>>([
    "id",
    "id:asc",
    "id:desc",
    "name",
    "name:asc",
    "name:desc",
    "url",
    "url:asc",
    "url:desc",
  ])
  .array()
  .default(["id:desc"]);

export const ListProxmoxIsoDownloadsInputSchema = z.object({
  // Required for trpc-to-openapi to work correctly
  sort: z.preprocess(
    preprocessQueryArray,
    sortSchema,
  ) as unknown as typeof sortSchema,
  name: ProxmoxIsoDownloadSchema.shape.name.optional(),
  url: ProxmoxIsoDownloadSchema.shape.url.optional(),
  page: PaginationSchema.shape.page,
  per_page: PaginationSchema.shape.per_page,
});

export type ListProxmoxIsoDownloadsInput = z.infer<
  typeof ListProxmoxIsoDownloadsInputSchema
>;

export const ListProxmoxIsoDownloadsOutputSchema = z.object({
  iso_downloads: z.array(
    ProxmoxIsoDownloadSchema.pick({
      id: true,
      name: true,
      url: true,
      expires_at: true,
      finished_at: true,
      failed_at: true,
    }),
  ),
  meta: z.object({
    pagination: PaginationSchema,
  }),
});

export type ListProxmoxIsoDownloadsOutput = z.infer<
  typeof ListProxmoxIsoDownloadsOutputSchema
>;

export const UploadProxmoxIsoInputSchema = ProxmoxIsoDownloadSchema.pick({
  url: true,
  name: true,
});

export type UploadProxmoxIsoInput = z.infer<typeof UploadProxmoxIsoInputSchema>;

export const UploadProxmoxIsoOutputSchema = GetProxmoxIsoDownloadOutputSchema;

export type UploadProxmoxIsoOutput = z.infer<
  typeof UploadProxmoxIsoOutputSchema
>;

export const GetProxmoxIsoDownloadStatusInputSchema =
  ProxmoxIsoDownloadSchema.pick({
    id: true,
  });

export type GetProxmoxIsoDownloadStatusInput = z.infer<
  typeof GetProxmoxIsoDownloadStatusInputSchema
>;

export const GetProxmoxIsoDownloadStatusOutputSchema = z.object({
  status: ProxmoxIsoDownloadSchema.pick({
    expires_at: true,
    finished_at: true,
    failed_at: true,
  }).extend({
    percentage: z
      .number()
      .int()
      .min(0)
      .max(100)
      .nullable()
      .meta({
        description:
          "The current percentage of the ISO image download that has been completed. This value is only available while the ISO image download process is running.",
        examples: [0, 10, 50, 100],
      }),
  }),
});

export type GetProxmoxIsoDownloadStatusOutput = z.infer<
  typeof GetProxmoxIsoDownloadStatusOutputSchema
>;
