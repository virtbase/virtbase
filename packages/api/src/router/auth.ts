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

import { TRPCError } from "@trpc/server";
import { and, count, eq, isNotNull } from "@virtbase/db";
import { accounts, users } from "@virtbase/db/schema";
import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const authRouter = createTRPCRouter({
  checkAccountExists: publicProcedure
    .meta({
      ratelimit: {
        requests: 8,
        seconds: "1 m",
        fingerprint: ({ defaultFingerprint }) =>
          `check-account-exists:${defaultFingerprint}`,
      },
    })
    .input(
      z.object({
        email: z.email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      if (ctx.session || ctx.apiKey) {
        // Authenticated users don't need to check if an account exists
        // Also not possible via API
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const result = await db.transaction(
        async (tx) => {
          return tx
            .select({
              accounts: count(accounts.id),
            })
            .from(users)
            .where(eq(users.email, input.email))
            .leftJoin(
              accounts,
              and(
                eq(users.id, accounts.userId),
                eq(accounts.providerId, "credential"),
                isNotNull(accounts.password),
              ),
            )
            .groupBy(users.id)
            .limit(1)
            .then(([row]) => row);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      if (!result) {
        return {
          accountExists: false,
          hasPassword: false,
        };
      }

      return {
        accountExists: true,
        hasPassword: result.accounts > 0,
      };
    }),
});
