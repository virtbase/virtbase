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

import {
  FIRWALL_PROTOCOLS,
  FIRWALL_PROTOCOLS_WITH_PORTS,
  ICMP_TYPE_NAMES,
  ICMPV6_TYPE_NAMES,
} from "@virtbase/utils";
import * as z from "zod";
import { EXAMPLE_DATE, RFC3339LINK } from "../timestamps";
import { ServerSchema } from "./shared";

export const GetServerFirewallOptionsInputSchema = z.object({
  server_id: ServerSchema.shape.id,
});

const policySchema = z.enum(["ACCEPT", "DROP", "REJECT"]);

const policyInSchema = policySchema.optional().meta({
  description: "The default action for incoming packets.",
  example: "ACCEPT",
});

const policyOutSchema = policySchema.optional().meta({
  description: "The default action for outgoing packets.",
  example: "DROP",
});

export const GetServerFirewallOptionsOutputSchema = z.object({
  options: z.object({
    enabled: z.boolean().meta({
      description: "Whether the firewall is enabled.",
    }),
    //dhcp: z.union([z.literal(0), z.literal(1)]).optional(),
    //ipfilter: z.union([z.literal(0), z.literal(1)]).optional(),
    //log_level_in: z.string().optional(),
    //log_level_out: z.string().optional(),
    //macfilter: z.union([z.literal(0), z.literal(1)]).optional(),
    //ndp: z.union([z.literal(0), z.literal(1)]).optional(),
    policy_in: policyInSchema,
    policy_out: policyOutSchema,
    //radv: z.union([z.literal(0), z.literal(1)]).optional(),
    digest: z.string().optional(),
  }),
});

export const UpdateServerFirewallOptionsInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  policy_in: policyInSchema,
  policy_out: policyOutSchema,
});

export const UpdateServerFirewallOptionsOutputSchema = z.void();

const FirewallRuleSchema = z.object({
  enabled: z.boolean().optional().meta({
    description: "Whether the rule is enabled.",
    example: true,
  }),
  direction: z.enum(["in", "out"]).optional().meta({
    description: "The direction of the rule.",
    example: "in",
  }),
  pos: z.int().min(0).meta({
    description: "The position of the rule. Lower numbers are processed first.",
    example: 0,
  }),
  proto: z.enum(FIRWALL_PROTOCOLS).optional().meta({
    description: "The protocol of the rule.",
    example: "tcp",
  }),
  dport: z
    .string()
    .optional()
    .meta({
      description: `The destination port of the rule. Only valid for protocols: ${FIRWALL_PROTOCOLS_WITH_PORTS.map((proto) => `\`${proto}\``).join(", ")}.`,
      example: "80",
    }),
  sport: z
    .string()
    .optional()
    .meta({
      description: `The source port of the rule. Only valid for protocols: ${FIRWALL_PROTOCOLS_WITH_PORTS.map((proto) => `\`${proto}\``).join(", ")}.`,
      example: "80",
    }),
  comment: z.string().max(64).optional().meta({
    description: "The comment of the rule.",
    example: "Allow HTTP traffic",
  }),
  action: policySchema.meta({
    description: "The action of the rule.",
    example: "ACCEPT",
  }),
  icmp_type: z
    .union([
      z.enum(ICMP_TYPE_NAMES).describe("ICMP types for protocol `icmp`"),
      z.enum(ICMPV6_TYPE_NAMES).describe("ICMP types for protocol `ipv6-icmp`"),
    ])
    .optional()
    .meta({
      description:
        "The ICMP type of the rule. Only valid for protocols: `icmp`, `ipv6-icmp`.",
      example: "echo-request",
    }),
  digest: z.string().optional(),
});

export const GetServerFirewallRulesInputSchema = z.object({
  server_id: ServerSchema.shape.id,
});

/**
 * Rules as Proxmox reports them.
 *
 * `source` and `dest` are read-only for now: they are not settable through the
 * create and update endpoints yet, but they have to be readable, because a rule
 * restricted to one network is not the same as one open to the internet - and
 * reading it as the latter would produce a security warning about a server that
 * is perfectly safe.
 */
const ReadFirewallRuleSchema = FirewallRuleSchema.extend({
  source: z.string().optional().meta({
    description:
      "The source address or network the rule is restricted to. Read-only.",
    example: "10.0.0.0/8",
  }),
  dest: z.string().optional().meta({
    description:
      "The destination address the rule is restricted to. Read-only.",
    example: "192.168.0.1",
  }),
});

export const GetServerFirewallRulesOutputSchema = z.object({
  rules: z.array(ReadFirewallRuleSchema),
});

export const CreateServerFirewallRuleInputSchema = FirewallRuleSchema.extend({
  server_id: ServerSchema.shape.id,
}).superRefine((input, ctx) => {
  if ((Boolean(input.sport) || Boolean(input.dport)) && !input.proto) {
    return ctx.addIssue({
      code: "custom",
      path: ["proto"],
    });
  }

  if (
    input.proto &&
    !FIRWALL_PROTOCOLS_WITH_PORTS.includes(input.proto as never)
  ) {
    if (input.sport) {
      ctx.addIssue({
        code: "custom",
        path: ["sport"],
      });
    }

    if (input.dport) {
      ctx.addIssue({
        code: "custom",
        path: ["dport"],
      });
    }
  }

  if (
    (input.proto === "icmp" || input.proto === "ipv6-icmp") &&
    !input.icmp_type
  ) {
    return ctx.addIssue({
      code: "custom",
      path: ["icmp_type"],
    });
  }

  if (
    input.proto === "icmp" &&
    input.icmp_type &&
    !ICMP_TYPE_NAMES.includes(input.icmp_type as never)
  ) {
    return ctx.addIssue({
      code: "custom",
      path: ["icmp_type"],
    });
  }

  if (
    input.proto === "ipv6-icmp" &&
    input.icmp_type &&
    !ICMPV6_TYPE_NAMES.includes(input.icmp_type as never)
  ) {
    return ctx.addIssue({
      code: "custom",
      path: ["icmp_type"],
    });
  }
});

export type CreateServerFirewallRuleInput = z.infer<
  typeof CreateServerFirewallRuleInputSchema
>;

export const CreateServerFirewallRuleOutputSchema = z.void();

export const UpdateServerFirewallRuleInputSchema = FirewallRuleSchema.partial({
  enabled: true,
  direction: true,
  proto: true,
  dport: true,
  sport: true,
  comment: true,
  action: true,
  icmp_type: true,
  digest: true,
}).extend({
  server_id: ServerSchema.shape.id,
});

export type UpdateServerFirewallRuleInput = z.infer<
  typeof UpdateServerFirewallRuleInputSchema
>;

export const UpdateServerFirewallRuleOutputSchema = z.void();

export const DeleteServerFirewallRuleInputSchema = FirewallRuleSchema.pick({
  pos: true,
  digest: true,
}).extend({
  server_id: ServerSchema.shape.id,
});

export const DeleteServerFirewallRuleOutputSchema = z.void();

export const MoveServerFirewallRuleInputSchema = FirewallRuleSchema.pick({
  pos: true,
  digest: true,
}).extend({
  server_id: ServerSchema.shape.id,
  moveto: z.int().min(0).meta({
    description: "The position to move the rule to.",
    example: 0,
  }),
});

export const MoveServerFirewallRuleOutputSchema = z.void();

export const GenerateServerFirewallRuleInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  prompt: z.string().min(1).max(512).meta({
    description: "The prompt to generate the rule.",
    example: "Allow HTTPS traffic, but block SSH traffic.",
  }),
});

export type GenerateServerFirewallRuleInput = z.infer<
  typeof GenerateServerFirewallRuleInputSchema
>;

const GeneratedFirewallRuleSchema = FirewallRuleSchema.pick({
  direction: true,
  action: true,
  proto: true,
  sport: true,
  dport: true,
  icmp_type: true,
  comment: true,
});

export const GenerateServerFirewallRuleOutputSchema = z.object({
  rules: z
    .array(GeneratedFirewallRuleSchema)
    .min(1)
    .max(5)
    .describe("The generated rules by the AI."),
  description: z.string().min(1).max(512).meta({
    description: "The reasoning and recommendation for the rules.",
    example:
      "The standard port for SSH is 22 and should be blocked. Port 80 should be allowed for HTTP traffic.",
  }),
});

export type GenerateServerFirewallRuleOutput = z.infer<
  typeof GenerateServerFirewallRuleOutputSchema
>;

/**
 * The firewalls Virtbase can detect running inside a server.
 */
export const GuestFirewallManagerSchema = z.enum([
  "ufw",
  "firewalld",
  "nftables",
  "iptables",
]);

/**
 * The outcome of looking inside the server.
 *
 * `no_firewall` and `unavailable` are kept apart deliberately: "we looked and
 * found nothing" is reassuring, while "we could not look" is not, and showing
 * the first when the second is true would tell a customer their server is fine
 * when nobody actually checked.
 */
export const GuestFirewallStatusSchema = z.enum([
  /** A firewall is running inside the server and its rules were read. */
  "ok",
  /** Nothing inside the server is filtering traffic. */
  "no_firewall",
  /** The guest agent could not be reached, so nothing was checked. */
  "unavailable",
]);

export type GuestFirewallStatus = z.infer<typeof GuestFirewallStatusSchema>;

const GuestFirewallRuleSchema = z.object({
  manager: GuestFirewallManagerSchema,
  index: z.int().nullable().meta({
    description: "Position as the firewall numbers it, if it numbers rules.",
    example: 1,
  }),
  chain: z.string().nullable().meta({
    description: "The chain or zone the rule belongs to.",
    example: "INPUT",
  }),
  direction: z.enum(["in", "out"]).nullable(),
  action: z.enum(["ACCEPT", "DROP", "REJECT"]).nullable().meta({
    description:
      "The rule's verdict, or `null` when it does not decide anything by itself, such as a logging rule.",
  }),
  proto: z.string().nullable(),
  dport: z.string().nullable().meta({
    description: "Destination port as written, which may be a list or range.",
    example: "80,443",
  }),
  sport: z.string().nullable(),
  source_addr: z.string().nullable(),
  dest_addr: z.string().nullable(),
  iface: z.string().nullable().meta({
    description: "The interface the rule is limited to, if any.",
    example: "eth0",
  }),
  comment: z.string().nullable(),
  raw: z.string().meta({
    description:
      "The rule exactly as the firewall printed it. Always present, because not every rule can be fully interpreted.",
    example: "-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT",
  }),
});

export const GetGuestFirewallInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  refresh: z.boolean().optional().meta({
    description: "Inspect the server again instead of serving a cached result.",
    example: false,
  }),
});

export type GetGuestFirewallInput = z.infer<typeof GetGuestFirewallInputSchema>;

export const GetGuestFirewallOutputSchema = z.object({
  guest: z.object({
    status: GuestFirewallStatusSchema,
    managers: z
      .array(
        z.object({
          manager: GuestFirewallManagerSchema,
          present: z.boolean().meta({
            description: "The tooling is installed.",
          }),
          active: z.boolean().meta({
            description: "It is filtering traffic, not merely installed.",
          }),
        }),
      )
      .meta({
        description: "Every firewall found inside the server.",
      }),
    primary: GuestFirewallManagerSchema.nullable().meta({
      description:
        "The firewall whose rules are shown. Front ends such as ufw win over the nftables or iptables ruleset they generate.",
      example: "ufw",
    }),
    default_policy: z
      .object({
        incoming: z.enum(["ACCEPT", "DROP", "REJECT"]).nullable(),
        outgoing: z.enum(["ACCEPT", "DROP", "REJECT"]).nullable(),
      })
      .nullable(),
    rules: z.array(GuestFirewallRuleSchema),
    unreadable_manager: GuestFirewallManagerSchema.nullable().meta({
      description:
        "Set when a firewall was found that Virtbase cannot read yet. Its rules still apply to your traffic.",
    }),
    checked_at: z.date().meta({
      description: `The timestamp of the inspection this result came from ${RFC3339LINK}. May be older than the request, because results are cached briefly.`,
      examples: [EXAMPLE_DATE],
    }),
  }),
});

export type GetGuestFirewallOutput = z.infer<
  typeof GetGuestFirewallOutputSchema
>;

/**
 * What a finding is about.
 *
 * Codes are stable and translated by the client, so the wording can change
 * without a schema change and analytics can count findings by kind.
 */
export const FirewallFindingCodeSchema = z.enum([
  /** A sensitive service is reachable from the internet. */
  "EXPOSED_SENSITIVE_PORT",
  /** A Virtbase rule allows a port that the firewall inside the server blocks. */
  "BLOCKED_BY_GUEST_FIREWALL",
  /** A rule opens a port that nothing is listening on. */
  "ORPHAN_RULE",
  /** Something could not be inspected, so the list may be incomplete. */
  "ANALYSIS_INCOMPLETE",
]);

export type FirewallFindingCode = z.infer<typeof FirewallFindingCodeSchema>;

export const FirewallFindingSeveritySchema = z.enum([
  "critical",
  "warning",
  "info",
]);

const FirewallFindingSchema = z.object({
  code: FirewallFindingCodeSchema,
  severity: FirewallFindingSeveritySchema,
  port: z.int().nullable(),
  proto: z.enum(["tcp", "udp"]).nullable(),
  service: z.string().nullable().meta({
    description: "The well-known service on this port, when there is one.",
    example: "Redis",
  }),
  processes: z.array(z.string()).meta({
    description: "The processes holding the port inside the server.",
    examples: [["redis-server"]],
  }),
  host_rule_pos: z.int().nullable().meta({
    description: "The Virtbase firewall rule this finding is about, if any.",
  }),
  manager: GuestFirewallManagerSchema.nullable(),
  suggested_rule: z
    .object({
      direction: z.literal("in"),
      action: z.enum(["ACCEPT", "DROP", "REJECT"]),
      proto: z.enum(["tcp", "udp"]),
      dport: z.string(),
    })
    .nullable()
    .meta({
      description:
        "A firewall rule that resolves this finding, when there is an obvious one.",
    }),
});

export const GetFirewallAnalysisInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  refresh: z.boolean().optional().meta({
    description: "Inspect the server again instead of serving a cached result.",
    example: false,
  }),
});

export type GetFirewallAnalysisInput = z.infer<
  typeof GetFirewallAnalysisInputSchema
>;

export const GetFirewallAnalysisOutputSchema = z.object({
  analysis: z.object({
    findings: z.array(FirewallFindingSchema).meta({
      description:
        "Security findings, most severe first. An empty list means nothing needs attention - common ports such as 22, 80 and 443 are not reported.",
    }),
    checked_at: z.date().meta({
      description: `The timestamp of the inspection this result came from ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  }),
});

export type GetFirewallAnalysisOutput = z.infer<
  typeof GetFirewallAnalysisOutputSchema
>;
