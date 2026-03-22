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
import type { CreateAPIKeyInput } from "@virtbase/validators";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

// Creating API keys is only possible via server actions
export const createApiKeyAction = async (input: CreateAPIKeyInput) => {
  const heads = await headers();

  const session = await auth.api.getSession({
    headers: heads,
  });

  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const response = await auth.api.createApiKey({
    body: {
      name: input.name,
      permissions: input.permissions,
      userId: session.user.id,
    },
  });

  return response.key;
};
