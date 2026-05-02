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

import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";
import { changeTempalateWorkflow } from "@virtbase/api/workflows";
import { eq } from "@virtbase/db";
import { proxmoxTemplates } from "@virtbase/db/schema";
import { mapProxmoxServerStatus, ProxmoxServerStatus } from "@virtbase/utils";
import {
  ChangeTemplateServerInputSchema,
  ChangeTemplateServerOutputSchema,
  ResetServerPasswordServerInputSchema,
  ResetServerPasswordServerOutputSchema,
} from "@virtbase/validators/server";
import { start } from "workflow/api";
import { createTRPCRouter, serverProcedure } from "../../../trpc";

export const serversActionsRouter = createTRPCRouter({
  changeTemplate: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/actions/change-template",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Change template",
        description: "Change the template of a server.",
      },
      permissions: {
        servers: ["write"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
      expand: ["plan"],
      ratelimit: {
        requests: 2,
        seconds: "60 s",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `change-server-template:${userId || defaultFingerprint}`,
      },
    })
    .input(ChangeTemplateServerInputSchema)
    .output(ChangeTemplateServerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, server, proxmoxNode } = ctx;

      if ("object" !== typeof server.plan) {
        // Expected a plan object but got a string
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      const {
        root_password: initialRootPassword,
        template_id: proxmoxTemplateId,
      } = input;

      await db.transaction(
        async (tx) => {
          const existing = await tx
            .select({
              id: proxmoxTemplates.id,
            })
            .from(proxmoxTemplates)
            .where(eq(proxmoxTemplates.id, proxmoxTemplateId))
            .limit(1)
            .then(([row]) => row);

          if (!existing) {
            throw new TRPCError({
              code: "NOT_FOUND",
            });
          }
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      await start(changeTempalateWorkflow, [
        {
          initialRootPassword,
          proxmoxNode,
          proxmoxTemplateId,
          vmid: server.vmid,
          serverId: server.id,
          size: server.plan.storage,
        },
      ]);
    }),
  resetPassword: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/actions/reset-password",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Reset password",
        description:
          "Reset the password of a user on a server. Requires the `qemu-guest-agent` to be installed and the server to be running.",
      },
      permissions: {
        servers: ["write"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
      ratelimit: {
        requests: 3,
        seconds: "60 s",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `reset-server-password:${userId || defaultFingerprint}`,
      },
    })
    .input(ResetServerPasswordServerInputSchema)
    .output(ResetServerPasswordServerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { instance } = ctx;
      const { vm } = instance;

      const response = await vm.status.current.$get();
      const status = mapProxmoxServerStatus(response);

      if (status !== ProxmoxServerStatus.RUNNING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
        });
      }

      const { username, password } = input;

      try {
        await vm.agent["set-user-password"].$post({
          username,
          password,
        });
      } catch (error) {
        Sentry.captureException(error);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
});
