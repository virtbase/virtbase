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
import { initTRPC, TRPCError } from "@trpc/server";
import type { Auth } from "@virtbase/auth";
import { and, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  datacenters,
  proxmoxNodes,
  proxmoxTemplates,
  serverPlans,
  servers,
} from "@virtbase/db/schema";
import { isInstalling, isSuspended, isTerminated } from "@virtbase/utils";
import type { APIKeyPermissions } from "@virtbase/validators";
import type { ServerExpand } from "@virtbase/validators/server";
import { GetServerInputSchema } from "@virtbase/validators/server";
import superjson from "superjson";
import type { OpenApiMeta } from "trpc-to-openapi";
import z, { ZodError } from "zod";
import { lexware } from "./lexware";
import { getProxmoxInstance } from "./proxmox";
import { defaultFingerprint, ratelimit } from "./upstash";

export const createTRPCContext = async ({
  headers,
  setHeader,
  ...opts
}: {
  headers: Headers;
  setHeader: (name: string, value: string) => void;
  auth: Pick<Auth, "api">;
}) => {
  const authApi = opts.auth.api;

  // Only include the methods we need to avoid large type inference errors
  const narrowedAuthApi = {
    verifyApiKey: authApi.verifyApiKey,
    getSession: authApi.getSession,
  };

  const sharedContext = {
    db,
    authApi: narrowedAuthApi,
    lexware,
    headers,
    setHeader,
  };

  const apiKey = headers.get("x-virtbase-api-key");
  if (apiKey) {
    return {
      ...sharedContext,
      apiKey,
      session: null,
    };
  }

  const session = await authApi.getSession({
    headers,
  });

  return {
    ...sharedContext,
    apiKey: null,
    session,
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
        fingerprint: (ctx: {
          userId?: string | null;
          defaultFingerprint: string;
        }) => string;
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

type ServerProcedureMeta = {
  /**
   * Restrict the procedure to only allow
   * certain server states.
   */
  forbiddenStates?: Array<"suspended" | "terminated" | "installing">;
  /**
   * Additional fields to return with
   * the server data.
   */
  expand?: ServerExpand;
};

type APIKeyProcedureMeta = {
  /**
   * Restrict the procedure to only allow
   * certain API key permissions.
   */
  permissions?: Partial<APIKeyPermissions>;
};

const t = initTRPC
  .meta<
    OpenApiMeta & RatelimitMeta & ServerProcedureMeta & APIKeyProcedureMeta
  >()
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

const sentryMiddleware = t.middleware(
  Sentry.trpcMiddleware({
    attachRpcInput: true,
  }),
);

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
    if (ratelimitConfig === false || t._config.isDev) {
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
    const defaultFingerprintValue = defaultFingerprint(headers);
    const desiredFingerprint = fingerprintFn?.({
      userId,
      defaultFingerprint: defaultFingerprintValue,
    });

    const fingerprint = desiredFingerprint || userId || defaultFingerprintValue;

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
const authMiddleware = t.middleware(async ({ ctx, next, meta }) => {
  if (ctx.apiKey) {
    const result = await ctx.authApi.verifyApiKey({
      body: {
        key: ctx.apiKey,
        permissions: meta?.permissions,
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

  Sentry.setUser({
    id: ctx.session.user.id,
    email: ctx.session.user.email,
    username: ctx.session.user.name,
  });

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

const serverMiddleware = authMiddleware.unstable_pipe(
  async ({ ctx, next, getRawInput, meta }) => {
    const rawInput = await getRawInput();

    const { success, data } =
      await GetServerInputSchema.safeParseAsync(rawInput);
    if (!success) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }

    const { server_id: serverId, expand } = data;

    // Merge internal expansions with user provided expansions and deduplicate
    const expansions = new Set([...(meta?.expand ?? []), ...expand]);

    const { db } = ctx;
    const server = await db.transaction(
      async (tx) => {
        return tx
          .select({
            id: servers.id,
            name: servers.name,
            vmid: servers.vmid,
            installed_at: servers.installedAt,
            suspended_at: servers.suspendedAt,
            terminates_at: servers.terminatesAt,
            created_at: servers.createdAt,
            plan: expansions.has("plan")
              ? serverPlans.id
              : {
                  id: serverPlans.id,
                  name: serverPlans.name,
                  cores: serverPlans.cores,
                  memory: serverPlans.memory,
                  storage: serverPlans.storage,
                },
            template: expansions.has("template")
              ? proxmoxTemplates.id
              : {
                  id: proxmoxTemplates.id,
                  icon: proxmoxTemplates.icon,
                },
            datacenter: expansions.has("datacenter")
              ? datacenters.id
              : {
                  id: datacenters.id,
                  name: datacenters.name,
                },
            node: expansions.has("node")
              ? proxmoxNodes.id
              : {
                  id: proxmoxNodes.id,
                  hostname: proxmoxNodes.hostname,
                  netrate: proxmoxNodes.netrate,
                  storage_description: proxmoxNodes.storageDescription,
                  memory_description: proxmoxNodes.memoryDescription,
                  cpu_description: proxmoxNodes.cpuDescription,
                },
            proxmoxNode: {
              id: proxmoxNodes.id,
              hostname: proxmoxNodes.hostname,
              fqdn: proxmoxNodes.fqdn,
              // [!] Sensitive data
              tokenID: proxmoxNodes.tokenID,
              tokenSecret: proxmoxNodes.tokenSecret,
            },
          })
          .from(servers)
          .where(
            and(
              eq(servers.id, serverId),
              // [!] Authorization: Only allow the user to access their own servers
              eq(servers.userId, ctx.userId),
            ),
          )
          .innerJoin(proxmoxNodes, eq(proxmoxNodes.id, servers.proxmoxNodeId))
          .innerJoin(datacenters, eq(datacenters.id, proxmoxNodes.datacenterId))
          .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
          .leftJoin(
            proxmoxTemplates,
            eq(servers.proxmoxTemplateId, proxmoxTemplates.id),
          )
          .limit(1)
          .then(([row]) => row);
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    if (!server) {
      // Server does not exist or user does not have access to it
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (meta?.forbiddenStates && meta.forbiddenStates.length > 0) {
      if (
        (meta.forbiddenStates.includes("suspended") && isSuspended(server)) ||
        (meta.forbiddenStates.includes("terminated") && isTerminated(server)) ||
        (meta.forbiddenStates.includes("installing") && isInstalling(server))
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    }

    // [!] Split sensitive data from server data
    const { proxmoxNode, ...serverData } = server;

    const instance = getProxmoxInstance(proxmoxNode);

    return next({
      ctx: {
        server: serverData,
        proxmoxNode,
        instance: {
          ...instance,
          vm: instance.node.qemu.$(serverData.vmid),
        },
      },
    });
  },
);

export const publicProcedure = t.procedure
  .use(sentryMiddleware)
  .use(ratelimitMiddleware);

export const protectedProcedure = t.procedure
  .use(sentryMiddleware)
  .use(ratelimitMiddleware)
  .use(authMiddleware);

export const serverProcedure = t.procedure
  .use(sentryMiddleware)
  .use(ratelimitMiddleware)
  // Server middleware already includes authMiddleware
  .use(serverMiddleware);
