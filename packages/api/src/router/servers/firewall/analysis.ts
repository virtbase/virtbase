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
import type { FirewallAction, HostFirewallRuleInput } from "@virtbase/utils";
import { analyzeFirewall } from "@virtbase/utils";
import {
  GetFirewallAnalysisInputSchema,
  GetFirewallAnalysisOutputSchema,
} from "@virtbase/validators/server";
import { inspectGuest } from "../../../guest-firewall";
import { serverProcedure } from "../../../trpc";

const ACTIONS = new Set(["ACCEPT", "DROP", "REJECT"]);

const asAction = (value: unknown): FirewallAction | null =>
  typeof value === "string" && ACTIONS.has(value)
    ? (value as FirewallAction)
    : null;

export const serverFirewallAnalysisRouter = {
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/firewall/analysis",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Analyse the server's exposure",
        description:
          "Combines the Virtbase firewall rules, the firewall running inside the server and the ports the server is listening on into a list of security findings. Requires the `qemu-guest-agent` to see inside the server.",
      },
      permissions: {
        firewall: ["read"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
    })
    .input(GetFirewallAnalysisInputSchema)
    .output(GetFirewallAnalysisOutputSchema)
    .query(async ({ ctx, input }) => {
      const { server, instance } = ctx;
      const { vm } = instance;

      // The guest inspection is the slow half and is cached; the Proxmox reads
      // are cheap and deliberately are not, so a rule the customer just changed
      // is reflected in the advice immediately.
      const [inspection, rules, options] = await Promise.all([
        inspectGuest({
          vm,
          serverId: server.id,
          refresh: input.refresh,
        }),
        vm.firewall.rules.$get(),
        vm.firewall.options.$get(),
      ]);

      const hostRules: HostFirewallRuleInput[] = rules.flatMap((rule) => {
        const action = asAction(rule.action);

        // A rule whose action is not a verdict cannot decide reachability.
        if (!action) {
          return [];
        }

        return [
          {
            pos: rule.pos,
            enabled: Boolean(rule.enable),
            direction:
              rule.type === "in" ? "in" : rule.type === "out" ? "out" : null,
            action,
            proto: rule.proto ?? null,
            dport: rule.dport ?? null,
            source: rule.source ?? null,
          },
        ];
      });

      const findings = analyzeFirewall({
        hostRules,
        hostPolicy: asAction(options.policy_in),
        guest:
          inspection.status === "unavailable"
            ? null
            : {
                active: inspection.primary !== null,
                readable: inspection.unreadableManager === null,
                manager: inspection.primary,
                defaultPolicy: inspection.defaultPolicy,
                rules: inspection.rules,
              },
        listeners: inspection.sockets,
      });

      return {
        analysis: {
          findings: findings.map((finding) => ({
            code: finding.code,
            severity: finding.severity,
            port: finding.port,
            proto: finding.proto,
            service: finding.service,
            processes: finding.processes,
            host_rule_pos: finding.hostRulePos,
            manager: finding.manager,
            suggested_rule: finding.suggestedRule,
          })),
          checked_at: new Date(inspection.checkedAt),
        },
      };
    }),
} satisfies TRPCRouterRecord;
