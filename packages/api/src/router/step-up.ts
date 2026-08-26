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
import { and, eq, isNotNull } from "@virtbase/db";
import { accounts, passkeys } from "@virtbase/db/schema";
import * as z from "zod";
import { isStepUpSatisfied } from "../step-up";
import { grantStepUp } from "../step-up/marker";
import { protectedProcedure } from "../trpc";

/**
 * Re-authentication for actions that cannot be taken back.
 *
 * Only the password challenge lives here. Passkey and email OTP are ordinary
 * Better Auth sign-ins driven from the client, and a sign-in mints a session
 * young enough to satisfy the check on its own - so they need no endpoint of
 * their own, and no second implementation of WebAuthn or OTP to keep correct.
 */
export const stepUpRouter = {
  /**
   * Whether the customer needs to prove themselves, and how they can.
   *
   * `methods` is what stops the dialog offering a password box to somebody who
   * only ever signed in with Discord.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const { db, userId, session } = ctx;

    if (!session) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This action cannot be performed with an API key.",
      });
    }

    const [credentials, registeredPasskeys] = await db.transaction(
      async (tx) => {
        return Promise.all([
          tx.$count(
            accounts,
            and(
              eq(accounts.userId, userId),
              eq(accounts.providerId, "credential"),
              isNotNull(accounts.password),
            ),
          ),
          tx.$count(passkeys, eq(passkeys.userId, userId)),
        ]);
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    return {
      satisfied: await isStepUpSatisfied(session),
      // The address the email code would go to. Returned so the dialog does
      // not have to reach for the session separately just to name it.
      email: session.user.email,
      methods: {
        password: credentials > 0,
        passkey: registeredPasskeys > 0,
        // Every account has an address we can reach, so this is the path that
        // is always open - including for social logins with no password.
        emailOtp: true,
      },
    };
  }),

  /**
   * Proves the customer knows their password, without minting a session.
   *
   * The other two challenges re-authenticate by signing in again; this one
   * cannot, so it writes the marker directly.
   */
  verifyPassword: protectedProcedure
    .meta({
      ratelimit: {
        requests: 5,
        seconds: "5 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `step-up-password:${userId || defaultFingerprint}`,
      },
    })
    .input(
      z.object({
        // Not `PasswordSchema` on purpose: this checks a password that already
        // exists, and rejecting it for failing today's strength rules would
        // lock out exactly the accounts most in need of the check.
        password: z.string().min(1).max(256),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { session } = ctx;

      if (!session) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This action cannot be performed with an API key.",
        });
      }

      try {
        await ctx.authApi.verifyPassword({
          body: { password: input.password },
          headers: ctx.headers,
        });
      } catch {
        // Better Auth answers a wrong password with BAD_REQUEST. Narrow it to
        // UNAUTHORIZED so the client can tell "wrong password" apart from
        // "malformed request" without reading a message string.
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      await grantStepUp(session.session.token);

      return { satisfied: true };
    }),
} satisfies TRPCRouterRecord;
