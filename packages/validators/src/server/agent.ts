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
import { EXAMPLE_DATE, RFC3339LINK } from "../timestamps";
import { ServerSchema } from "./shared";

/**
 * The single field a client switches on.
 *
 * The underlying signals - is the agent configured, is the VM running, did it
 * answer, does it allow `guest-exec` - only make sense in combination, so they
 * are resolved into one state on the server. Every consumer then renders the
 * same thing for the same situation, and the combination logic is tested once.
 */
export const ServerAgentStatusSchema = z.enum([
  /** The agent answers and can run commands. Everything works. */
  "ok",
  /** The agent answers but `guest-exec` is blocked or too old. */
  "exec_unavailable",
  /** Configured, the server is running, but nothing answers. */
  "unreachable",
  /** The agent is switched off in the server's configuration. */
  "not_configured",
  /** The server is not running, so no agent is expected. */
  "server_stopped",
  /** The guest is not one the POSIX-based probes can inspect. */
  "unsupported_os",
  /** We could not determine the state - a Proxmox or permission problem. */
  "unavailable",
]);

export type ServerAgentStatus = z.infer<typeof ServerAgentStatusSchema>;

export const GetServerAgentStatusInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  refresh: z.boolean().optional().meta({
    description:
      "Re-probe the guest agent instead of serving a recently cached result.",
    example: false,
  }),
});

export type GetServerAgentStatusInput = z.infer<
  typeof GetServerAgentStatusInputSchema
>;

export const GetServerAgentStatusOutputSchema = z.object({
  agent: z.object({
    status: ServerAgentStatusSchema.meta({
      description: "The resolved state of the QEMU guest agent.",
      example: "ok",
    }),
    configured: z.boolean().meta({
      description:
        "Whether the guest agent is enabled in the server's configuration.",
    }),
    reachable: z.boolean().meta({
      description: "Whether the guest agent answered.",
    }),
    exec_available: z.boolean().nullable().meta({
      description:
        "Whether the agent allows running commands. `null` when the agent did not report its capabilities.",
    }),
    version: z.string().nullable().meta({
      description: "The reported guest agent version.",
      example: "8.2.1",
    }),
    os: z
      .object({
        id: z.string().nullable().meta({
          description: "The operating system identifier.",
          example: "debian",
        }),
        pretty_name: z.string().nullable().meta({
          description: "The human readable operating system name.",
          example: "Debian GNU/Linux 12 (bookworm)",
        }),
      })
      .nullable()
      .meta({
        description:
          "The guest operating system. `null` when the agent could not report it.",
      }),
    checked_at: z.date().meta({
      description: `The timestamp of the probe this result came from ${RFC3339LINK}. May be older than the request, because results are cached briefly.`,
      examples: [EXAMPLE_DATE],
    }),
  }),
});

export type GetServerAgentStatusOutput = z.infer<
  typeof GetServerAgentStatusOutputSchema
>;
