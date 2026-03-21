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

import { ProxmoxServerStatus, ProxmoxTaskStatus } from "@virtbase/utils";
import * as z from "zod";
import { ServerSchema } from "./shared";

export const GetServerStatusInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  with_storage_usage: z
    .boolean()
    .optional()
    .default(false)
    .meta({
      description:
        "Whether to include the storage usage in the response.\n\nDisabling this can improve the response time since it saves one additional API call to the guest agent.",
      examples: [true, false],
    }),
});

export const GetServerStatusOutputSchema = z.object({
  status: z.object({
    state: z.enum(ProxmoxServerStatus),
    task: z.enum(ProxmoxTaskStatus).nullable(),
    stats: z.object({
      netin: z
        .number()
        .optional()
        .meta({
          description:
            "The amount of network traffic in bytes received by the server since the last restart.",
          examples: [1000],
        }),
      netout: z
        .number()
        .optional()
        .meta({
          description:
            "The amount of network traffic in bytes sent by the server since the last restart.",
          examples: [1000],
        }),
      uptime: z
        .number()
        .optional()
        .meta({
          description:
            "The uptime of the server in seconds since the last restart.",
          examples: [1000],
        }),
      mem: z
        .number()
        .optional()
        .meta({
          description: "The amount of memory used by the server in bytes.",
          examples: [1000],
        }),
      freemem: z
        .number()
        .optional()
        .meta({
          description: "The amount of free memory in the server in bytes.",
          examples: [1.0737e9],
        }),
      maxmem: z
        .number()
        .optional()
        .meta({
          description:
            "The maximum amount of memory the server can use in bytes.",
          examples: [1.0737e9],
        }),
      disk: z
        .number()
        .optional()
        .meta({
          description:
            "The amount of disk space used by the server in bytes. Only available if the qemu guest agent is installed and `with_storage_usage` is `true`. Otherwise, this value is `0`.",
          examples: [10.737e9],
        }),
      cpu: z
        .number()
        .optional()
        .meta({
          description: "The absolute percentage of CPU used by the server.",
          examples: [0.5, 0.25, 1],
        }),
      maxdisk: z
        .number()
        .optional()
        .meta({
          description:
            "The maximum amount of disk space the server can use in bytes.",
          examples: [1000],
        }),
      cpus: z
        .number()
        .optional()
        .meta({
          description: "The number of vCores of the server.",
          examples: [1, 2, 4, 8],
        }),
    }),
    installedAt: ServerSchema.shape.installed_at,
    suspendedAt: ServerSchema.shape.suspended_at,
    terminatesAt: ServerSchema.shape.terminates_at,
  }),
});
