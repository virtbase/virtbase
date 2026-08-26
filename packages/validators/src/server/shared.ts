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

/**
 * Where the reported operating system came from.
 *
 * Worth exposing rather than flattening away: `detected` is what the server is
 * running, while `iso` and `template` are only what it was installed from and
 * may be wrong by the time anybody reads them.
 */
export const ServerOperatingSystemSourceSchema = z.enum([
  /** Read out of the running guest through the `qemu-guest-agent`. */
  "detected",
  /** Guessed from the ISO image currently mounted. */
  "iso",
  /** Guessed from the template the server was provisioned from. */
  "template",
  /** Nothing to go on. */
  "unknown",
]);

export type ServerOperatingSystemSource = z.infer<
  typeof ServerOperatingSystemSourceSchema
>;

/**
 * The operating system a server is running.
 *
 * Not an expand: it is resolved from columns on the server row itself, so it
 * costs nothing to include and is always present.
 */
export const ServerOperatingSystemSchema = z
  .object({
    slug: z
      .string()
      .nullable()
      .meta({
        description:
          "Stable identifier for the operating system, or `null` when it could not be recognised.",
        examples: ["debian"],
      }),
    name: z
      .string()
      .nullable()
      .meta({
        description:
          "The operating system's name. When `source` is `detected` this is the guest's own `PRETTY_NAME`, so it is written by whoever controls the server and is not a value to trust.",
        examples: ["Debian GNU/Linux 13 (trixie)"],
      }),
    icon: z
      .string()
      .nullable()
      .meta({
        description:
          "Path to the operating system's logo, relative to the Virtbase app.",
        examples: ["/assets/static/distros/debian.svg"],
      }),
    source: ServerOperatingSystemSourceSchema.meta({
      description: "Where this information came from.",
      example: "detected",
    }),
    detected_at: z
      .date()
      .nullable()
      .meta({
        description: `The timestamp the operating system was last read out of the running server ${RFC3339LINK}. \`null\` when it never was.`,
        examples: [EXAMPLE_DATE],
      }),
  })
  .meta({
    description:
      "The operating system running inside the server. Read from the `qemu-guest-agent` where possible, so it reflects what is actually installed rather than what the server was provisioned with.",
  });
