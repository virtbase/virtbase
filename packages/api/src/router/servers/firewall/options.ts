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
  GetServerFirewallOptionsInputSchema,
  GetServerFirewallOptionsOutputSchema,
  UpdateServerFirewallOptionsInputSchema,
  UpdateServerFirewallOptionsOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../../trpc";

export const serverFirewallOptionsRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/firewall/options",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Get firewall settings",
        description: "Get the current firewall settings for a server.",
      },
      permissions: {
        firewall: ["read"],
      },
    })
    .input(GetServerFirewallOptionsInputSchema)
    .output(GetServerFirewallOptionsOutputSchema)
    .query(async ({ ctx }) => {
      const { instance } = ctx;

      const options = await instance.vm.firewall.options.$get();

      return {
        options: {
          enabled: !!options.enable,
          policy_in: options.policy_in as
            | "ACCEPT"
            | "DROP"
            | "REJECT"
            | undefined,
          policy_out: options.policy_out as
            | "ACCEPT"
            | "DROP"
            | "REJECT"
            | undefined,
          digest: options.digest,
        },
      };
    }),
  update: serverProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/servers/{server_id}/firewall/options",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Firewall"],
        summary: "Update firewall settings",
        description: "Update the firewall settings for a server.",
      },
      permissions: {
        firewall: ["write"],
      },
    })
    .input(UpdateServerFirewallOptionsInputSchema)
    .output(UpdateServerFirewallOptionsOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { instance } = ctx;

      await instance.vm.firewall.options.$put({
        policy_in: input.policy_in,
        policy_out: input.policy_out,
      });
    }),
});
