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

"use server";

import { TRPCError } from "@trpc/server";
import { db } from "@virtbase/db/client";
import { proxmoxNodeGroups } from "@virtbase/db/schema";
import { CreateProxmoxNodeGroupInputSchema } from "@virtbase/validators/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import { actionClient } from "../../lib/action-client";

export const createProxmoxNodeGroupAction = actionClient
  .inputSchema(CreateProxmoxNodeGroupInputSchema)
  .action(async ({ parsedInput }) => {
    const { name } = parsedInput;

    try {
      await db.transaction(
        async (tx) => {
          await tx.insert(proxmoxNodeGroups).values({ name });
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Failed to insert Proxmox node group into the database. Please try again later.",
      });
    }

    revalidateTag("proxmox-node-groups", "max");
    revalidatePath("/admin.virtbase.com");
  });
