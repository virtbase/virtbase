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
import { datacenters } from "@virtbase/db/schema";
import { CreateDatacenterInputSchema } from "@virtbase/validators/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import { actionClient } from "../../lib/action-client";

export const createDatacenterAction = actionClient
  .inputSchema(CreateDatacenterInputSchema)
  .action(async ({ parsedInput }) => {
    const { name, country } = parsedInput;

    try {
      await db.transaction(
        async (tx) => {
          await tx.insert(datacenters).values({ name, country });
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
          "Failed to insert datacenter into the database. Please try again later.",
      });
    }

    revalidateTag("datacenters", "max");
    revalidatePath("/admin.virtbase.com");
  });
