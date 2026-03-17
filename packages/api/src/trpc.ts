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

import { initTRPC, TRPCError } from "@trpc/server";
import type { Auth } from "@virtbase/auth";
import { db } from "@virtbase/db/client";
import superjson from "superjson";
import type { OpenApiMeta } from "trpc-to-openapi";
import z, { ZodError } from "zod";
import { defaultFingerprint, ratelimit } from "./upstash";

export const createTRPCContext = async ({
  headers,
  setHeader,
  ...opts
}: {
  headers: Headers;
  setHeader: (name: string, value: string) => void;
  auth: Auth;
}) => {
  const authApi = opts.auth.api;

  const apiKey = headers.get("x-virtbase-api-key");
  if (apiKey) {
    return {
      authApi,
      apiKey,
      session: null,
      db,
      headers,
      setHeader,
    };
  }

  const session = await authApi.getSession({
    headers,
  });

  return {
    authApi,
    apiKey: null,
    session,
    db,
    headers,
    setHeader,
  };
};

type RatelimitMeta = {
  /**
   * Ratelimit configuration for this endpoint.
   * If `false`, ratelimit is disabled for this endpoint.
   *
   * @default { requests: 10, seconds: "10 s" }
   */
  ratelimit?:
    | {
        fingerprint: (userId?: string | null) => string;
        requests: number;
        seconds:
          | `${number} ms`
          | `${number} s`
          | `${number} m`
          | `${number} h`
          | `${number} d`;
      }
    | false;
};

const t = initTRPC
  .meta<OpenApiMeta & RatelimitMeta>()
  .context<typeof createTRPCContext>()
  .create({
    transformer: superjson,
    errorFormatter: ({ shape, error }) => ({
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError
            ? z.flattenError(error.cause as ZodError<Record<string, unknown>>)
            : null,
      },
    }),
  });

export const createTRPCRouter = t.router;

// TODO: Ephemeral cache + optimistically check rate limit before authentication
/**
 * Ratelimits requests to the API.
 *
 * Cases:
 * 1) Custom fingerprint configured => used as key
 * 2) User is authenticated: use their ID as key
 * 3) No session / API key: use the IP address (default fingerprint) as key
 *
 */
const ratelimitMiddleware = t.middleware(
  async ({
    next,
    meta: { ratelimit: ratelimitConfig } = {},
    ctx: { headers, setHeader, session },
  }) => {
    if (ratelimitConfig === false) {
      // Ratelimit is disabled for this endpoint
      // Skip and go to the next middleware
      return next();
    }

    const {
      requests = 10,
      seconds = "10 s",
      fingerprint: fingerprintFn,
    } = ratelimitConfig || {};

    const userId = session?.user?.id ?? null;
    const desiredFingerprint = fingerprintFn?.(userId);

    const fingerprint =
      desiredFingerprint || userId || defaultFingerprint(headers);

    const { success, limit, reset, remaining } = await ratelimit(
      requests,
      seconds,
    ).limit(fingerprint);

    setHeader("X-RateLimit-Limit", `${limit}`);
    setHeader("X-RateLimit-Reset", `${reset}`);
    setHeader("X-RateLimit-Remaining", `${remaining}`);

    if (!success) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
    }

    return next();
  },
);

// TODO: Add OAuth
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (ctx.apiKey) {
    const result = await ctx.authApi.verifyApiKey({
      body: {
        key: ctx.apiKey,
        // TODO: Permissions
      },
    });

    if (!result.valid || !result.key) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return next({
      ctx: {
        session: null,
        apiKey: result.key,
        userId: result.key.referenceId,
      },
    });
  }

  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      apiKey: null,
      // infers the `session` as non-nullable
      session: {
        ...ctx.session,
        user: ctx.session.user,
      },
      // infers the `userId` as non-nullable
      userId: ctx.session.user.id,
    },
  });
});

export const publicProcedure = t.procedure.use(ratelimitMiddleware);

export const protectedProcedure = t.procedure
  .use(ratelimitMiddleware)
  .use(authMiddleware);
