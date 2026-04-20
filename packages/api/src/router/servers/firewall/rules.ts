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
  CreateServerFirewallRuleInputSchema,
  CreateServerFirewallRuleOutputSchema,
  DeleteServerFirewallRuleInputSchema,
  DeleteServerFirewallRuleOutputSchema,
  GetServerFirewallRulesInputSchema,
  GetServerFirewallRulesOutputSchema,
  MoveServerFirewallRuleInputSchema,
  MoveServerFirewallRuleOutputSchema,
  UpdateServerFirewallRuleInputSchema,
  UpdateServerFirewallRuleOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../../trpc";

export const serverFirewallRulesRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/firewall/rules",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Get current firewall rules",
        description: "Get the current firewall rules for a server.",
      },
      permissions: {
        firewall: ["read"],
      },
    })
    .input(GetServerFirewallRulesInputSchema)
    .output(GetServerFirewallRulesOutputSchema)
    .query(async ({ ctx }) => {
      const { instance } = ctx;

      const rules = await instance.vm.firewall.rules.$get();

      return {
        rules: rules.map((rule) => ({
          enabled: !!rule.enable,
          action: rule.action as "ACCEPT" | "DROP" | "REJECT",
          direction: rule.type as "out" | "in" | undefined,
          pos: rule.pos,
          proto: rule.proto,
          dport: rule.dport,
          sport: rule.sport,
          comment: rule.comment,
          icmp_type: rule["icmp-type"],
          digest: rule.digest,
        })),
      };
    }),
  create: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/firewall/rules",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Create a new firewall rule",
        description: "Create a new firewall rule for a server.",
      },
      permissions: {
        firewall: ["write"],
      },
    })
    .input(CreateServerFirewallRuleInputSchema)
    .output(CreateServerFirewallRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { instance } = ctx;

      await instance.vm.firewall.rules.$post({
        enable: input.enabled ? 1 : 0,
        // @ts-expect-error - direction is optional
        type: input.direction,
        pos: input.pos,
        proto: input.proto,
        dport: input.dport,
        sport: input.sport,
        comment: input.comment,
        action: input.action,
        "icmp-type": input.icmp_type,
        digest: input.digest,
        log: "nolog",
      });
    }),
  delete: serverProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/servers/{server_id}/firewall/rules",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Delete a firewall rule",
        description: "Delete a firewall rule for a server.",
      },
      permissions: {
        firewall: ["write"],
      },
    })
    .input(DeleteServerFirewallRuleInputSchema)
    .output(DeleteServerFirewallRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { instance } = ctx;

      await instance.vm.firewall.rules.$(`${input.pos}`).$delete({
        digest: input.digest,
      });
    }),
  update: serverProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/servers/{server_id}/firewall/rules",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Update a firewall rule",
        description: "Update a firewall rule for a server.",
      },
      permissions: {
        firewall: ["write"],
      },
    })
    .input(UpdateServerFirewallRuleInputSchema)
    .output(UpdateServerFirewallRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { instance } = ctx;
      const {
        pos,
        digest,
        enabled,
        direction,
        server_id: _,
        icmp_type,
        ...rest
      } = input;

      const undefinedFields = Object.entries({
        type: direction,
        "icmp-type": icmp_type,
        ...rest,
      }).filter(([_, value]) => value === undefined);

      await instance.vm.firewall.rules.$(`${pos}`).$put({
        ...rest,
        enable: enabled ? 1 : 0,
        ...(icmp_type && { "icmp-type": icmp_type }),
        ...(direction && { type: direction }),
        log: "nolog",
        digest,
        delete: undefinedFields.map(([key]) => key).join(","),
      });
    }),
  move: serverProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/servers/{server_id}/firewall/rules/{pos}/move",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Move a firewall rule",
        description: "Move a firewall rule for a server.",
      },
      permissions: {
        firewall: ["write"],
      },
    })
    .input(MoveServerFirewallRuleInputSchema)
    .output(MoveServerFirewallRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { instance } = ctx;
      const { pos, moveto, digest } = input;

      await instance.vm.firewall.rules.$(`${pos}`).$put({
        moveto: pos > moveto ? moveto : moveto + 1,
        digest,
      });
    }),
});
