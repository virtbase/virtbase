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

import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import {
  CreateServerFirewallRuleInputSchema,
  CreateServerFirewallRuleOutputSchema,
  DeleteServerFirewallRuleInputSchema,
  DeleteServerFirewallRuleOutputSchema,
  GenerateServerFirewallRuleInputSchema,
  GenerateServerFirewallRuleOutputSchema,
  GetServerFirewallRulesInputSchema,
  GetServerFirewallRulesOutputSchema,
  MoveServerFirewallRuleInputSchema,
  MoveServerFirewallRuleOutputSchema,
  UpdateServerFirewallRuleInputSchema,
  UpdateServerFirewallRuleOutputSchema,
} from "@virtbase/validators/server";
import { generateObject } from "ai";
import {
  buildGenerationContext,
  buildSystemPrompt,
} from "../../../firewall-ai";
import { inspectGuest } from "../../../guest-firewall";
import { serverProcedure } from "../../../trpc";
import {
  FIREWALL_AI_MODEL,
  GENERATION_TIMEOUT_MS,
  repairGeneratedText,
} from "./generation";

export const serverFirewallRulesRouter = {
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
          source: rule.source,
          dest: rule.dest,
          digest: rule.digest,
        })),
      };
    }),
  create: serverProcedure
    .meta({
      forbiddenStates: ["abuse-locked"],
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
        source: input.source,
        comment: input.comment,
        action: input.action,
        "icmp-type": input.icmp_type,
        digest: input.digest,
        log: "nolog",
      });
    }),
  delete: serverProcedure
    .meta({
      forbiddenStates: ["abuse-locked"],
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
      forbiddenStates: ["abuse-locked"],
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
      forbiddenStates: ["abuse-locked"],
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
  generate: serverProcedure
    .meta({
      forbiddenStates: ["suspended", "terminated"],
      permissions: {
        firewall: ["read"],
      },
      ratelimit: {
        requests: 10,
        seconds: "1 d",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `generate-firewall-rules:${userId || defaultFingerprint}`,
      },
    })
    .input(GenerateServerFirewallRuleInputSchema)
    .output(GenerateServerFirewallRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { server, instance } = ctx;
      const { vm } = instance;
      const { prompt, locale } = input;

      if (!process.env.AI_GATEWAY_API_KEY) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      // Everything the model needs to know about this particular server. The
      // guest inspection is cached and never allowed to fail the request: a
      // server without a working agent should still get rules, just without the
      // benefit of knowing what is listening on it.
      const [rules, options, inspection] = await Promise.all([
        vm.firewall.rules.$get(),
        vm.firewall.options.$get(),
        inspectGuest({ vm, serverId: server.id }).catch(() => null),
      ]);

      const context = buildGenerationContext({
        os: null,
        policyIn: options.policy_in ?? null,
        policyOut: options.policy_out ?? null,
        rules: rules.map((rule) => ({
          pos: rule.pos,
          enabled: Boolean(rule.enable),
          direction: rule.type,
          action: rule.action,
          proto: rule.proto,
          dport: rule.dport,
          sport: rule.sport,
          source: rule.source,
          comment: rule.comment,
        })),
        sockets: inspection?.sockets ?? null,
        guestManager: inspection?.primary ?? null,
      });

      const result = await generateObject({
        model: FIREWALL_AI_MODEL,
        system: buildSystemPrompt(locale),
        prompt: [`Server:\n${context}`, "", `Request: ${prompt}`].join("\n"),
        schema: GenerateServerFirewallRuleOutputSchema,
        schemaName: "annotated_rules",
        schemaDescription:
          "Firewall rules to create, with an explanation and recommendation.",
        // The mistakes a model reliably makes are normalised away before the
        // schema sees them, so they cost nothing instead of a whole retry.
        repairText: async ({ text }) => repairGeneratedText(text),
        maxRetries: 2,
        abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
        providerOptions: {
          gateway: {
            caching: "auto",
          },
        },
      });

      return result.object;
    }),
} satisfies TRPCRouterRecord;
