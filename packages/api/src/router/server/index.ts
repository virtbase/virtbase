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

import { and, eq } from "@virtbase/db";
import { servers } from "@virtbase/db/schema";
import {
  RenameServerInputSchema,
  RenameServerOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../trpc";
import { serverFirewallRouter } from "./firewall";

export const serverRouter = createTRPCRouter({
  firewall: serverFirewallRouter,
  rename: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/rename",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Rename a server",
        description: "Renames a server by its unique identifier.",
      },
    })
    .input(RenameServerInputSchema)
    .output(RenameServerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, server, userId } = ctx;

      await db.transaction(async (tx) => {
        await tx
          .update(servers)
          .set({
            name: input.name,
          })
          .where(
            and(
              eq(servers.id, server.id),
              // [!] Additional check: Only allow the user to rename their own server
              // Handled by the server middleware, but check as extra safety
              eq(servers.userId, userId),
            ),
          );
      });
    }),
});
