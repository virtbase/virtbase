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
import {
  GetGuestFirewallInputSchema,
  GetGuestFirewallOutputSchema,
} from "@virtbase/validators/server";
import { inspectGuest } from "../../../guest-firewall";
import { serverProcedure } from "../../../trpc";

export const serverFirewallGuestRouter = {
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/firewall/guest",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Get the firewall running inside the server",
        description:
          "Detects a host-based firewall such as `ufw` or `iptables` running inside the server and reads its rules. Traffic must pass both the Virtbase firewall and this one, so a rule here can block traffic the Virtbase firewall allows. Requires the `qemu-guest-agent`.",
      },
      permissions: {
        firewall: ["read"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
    })
    .input(GetGuestFirewallInputSchema)
    .output(GetGuestFirewallOutputSchema)
    .query(async ({ ctx, input }) => {
      const { server, instance } = ctx;

      const result = await inspectGuest({
        vm: instance.vm,
        serverId: server.id,
        refresh: input.refresh,
      });

      return {
        guest: {
          status: result.status,
          managers: result.managers,
          primary: result.primary,
          default_policy: result.defaultPolicy,
          rules: result.rules.map((rule) => ({
            manager: rule.manager,
            index: rule.index,
            chain: rule.chain,
            direction: rule.direction,
            action: rule.action,
            proto: rule.proto,
            dport: rule.dport,
            sport: rule.sport,
            source_addr: rule.sourceAddr,
            dest_addr: rule.destAddr,
            iface: rule.iface,
            comment: rule.comment,
            raw: rule.raw,
          })),
          unreadable_manager: result.unreadableManager,
          checked_at: new Date(result.checkedAt),
        },
      };
    }),
} satisfies TRPCRouterRecord;
