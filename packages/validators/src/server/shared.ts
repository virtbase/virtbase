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
import {
  EXAMPLE_DATE,
  ObjectTimestampSchema,
  RFC3339LINK,
} from "../timestamps";

export const ServerSchema = z.object({
  id: z
    .string()
    .regex(/^kvm_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the server.",
      examples: ["kvm_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  // userId placeholder
  // serverPlanId placeholder
  // proxmoxNodeId placeholder
  // proxmoxTemplateId placeholder
  name: z
    .string()
    .min(1)
    .max(64)
    .meta({
      description: "Display name of the server.",
      examples: ["My server"],
    }),
  vmid: z
    .int()
    .positive()
    .meta({
      description: "Proxmox VM ID of the server.",
      examples: [100],
      internal: true,
    }),
  installed_at: z
    .date()
    .nullable()
    .meta({
      description: `The timestamp when the server was installed ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  terminates_at: z
    .date()
    .nullable()
    .meta({
      description: `The timestamp when the server will be terminated ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  renewal_reminder_sent_at: z
    .date()
    .nullable()
    .meta({
      description: `The timestamp when the last renewal reminder was sent ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  suspended_at: z
    .date()
    .nullable()
    .meta({
      description: `The timestamp when the server was suspended ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type Server = z.infer<typeof ServerSchema>;
