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
  proto: z
    .union([z.enum(FIRWALL_PROTOCOLS), z.string()])
    .optional()
    .meta({
      description: "The protocol of the rule.",
      example: "tcp",
    }),
  dport: z.string().optional().meta({
    description: "The destination port of the rule.",
    example: "80",
  }),
  sport: z.string().optional().meta({
    description: "The source port of the rule.",
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
    .union([z.enum(ICMP_TYPE_NAMES), z.enum(ICMPV6_TYPE_NAMES)])
    .optional()
    .meta({
      description: "The ICMP type of the rule. Only valid for ICMP protocol.",
      example: "echo-request",
    }),
  digest: z.string().optional(),
});

export const GetServerFirewallRulesInputSchema = z.object({
  server_id: ServerSchema.shape.id,
});

export const GetServerFirewallRulesOutputSchema = z.object({
  rules: z.array(FirewallRuleSchema),
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
