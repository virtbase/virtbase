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

import * as z from "zod";
import { ServerSchema } from "./shared";

export const GetServerGraphsInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  timeframe: z.enum(["hour", "day", "week", "month", "year"]).meta({
    description: "The timeframe to get the graph data for.",
    examples: ["hour", "day", "week", "month", "year"],
  }),
  cf: z
    .enum(["AVERAGE", "MAX"])
    .optional()
    .default("AVERAGE")
    .meta({
      description: "The RRD consolidation function to use for the graph data.",
      examples: ["AVERAGE", "MAX"],
    }),
});

export const GetServerGraphsOutputSchema = z.object({
  data: z.array(
    z.object({
      cpu: z
        .number()
        .min(0)
        .max(1)
        .meta({
          description: "The absolute percentage of CPU used by the server.",
          examples: [0.5, 0.25, 1],
        }),
      mem: z
        .number()
        .min(0)
        .meta({
          description: "The amount of memory used by the server in bytes.",
          examples: [1000],
        }),
      maxmem: z
        .number()
        .min(0)
        .meta({
          description:
            "The maximum amount of memory the server can use in bytes.",
          examples: [1000],
        }),
      diskread: z
        .number()
        .min(0)
        .meta({
          description:
            "The amount of disk space read in bytes by the server in the given timeframe.",
          examples: [1000],
        }),
      diskwrite: z
        .number()
        .min(0)
        .meta({
          description:
            "The amount of disk space written by the server in the given timeframe.",
          examples: [1000],
        }),
      netin: z
        .number()
        .min(0)
        .meta({
          description:
            "The amount of network traffic in bytes received by the server in the given timeframe.",
          examples: [1000],
        }),
      netout: z
        .number()
        .min(0)
        .meta({
          description:
            "The amount of network traffic in bytes sent by the server in the given timeframe.",
          examples: [1000],
        }),
      time: z
        .number()
        .min(0)
        .meta({
          description:
            "The timestamp of the data point in seconds since the Unix epoch.",
          examples: [1715222400],
        }),
    }),
  ),
});
