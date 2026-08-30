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
import type { Auth, Session } from "@virtbase/auth";
import { and, eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { touchLastSeen } from "@virtbase/db/queries";
import {
  datacenters,
  proxmoxIsoDownloads,
  proxmoxNodes,
  proxmoxTemplates,
  serverPlanPrices,
  serverPlans,
  servers,
  subnetAllocations,
  subnets,
  users,
} from "@virtbase/db/schema";
import {
  isInstalling,
  isSuspended,
  isTerminated,
  resolveServerOperatingSystem,
} from "@virtbase/utils";
import type { APIKeyPermissions } from "@virtbase/validators";
import type { ServerExpand } from "@virtbase/validators/server";
import { GetServerInputSchema } from "@virtbase/validators/server";
import superjson from "superjson";
import type { OpenApiMeta } from "trpc-to-openapi";
import z, { ZodError } from "zod";
import { getProxmoxInstance } from "./proxmox";
import { isStepUpSatisfied } from "./step-up";
import { defaultFingerprint, ratelimit } from "./upstash";

type TRPCContext = {
  db: typeof db;
  // Only include the methods we need to avoid large type inference errors
  authApi: Pick<Auth["api"], "verifyApiKey" | "getSession" | "verifyPassword">;
  headers: Headers;
  setHeader: (name: string, value: string) => void;
  apiKey: string | null;
  session: Session | null;
};

export const createTRPCContext = async ({
  headers,
  setHeader,
  authApi,
}: Pick<
  TRPCContext,
  "headers" | "setHeader" | "authApi"
>): Promise<TRPCContext> => {
  const sharedContext = {
    db,
    authApi,
    headers,
    setHeader,
  } satisfies Partial<TRPCContext>;

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
export interface TRPCMeta extends OpenApiMeta {
  /**
   * A custom rate limit configuration for this endpoint.
   * - If set to an object, that configuration is used.
   * - If set to `false`, rate limiting is disabled for this endpoint.
   * - If omitted, the default from `ratelimit.ts` applies.
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
  /**
   * Restrict the procedure to only allow
   * certain server states.
   */
  forbiddenStates?: Array<
    "suspended" | "terminated" | "installing" | "abuse-locked"
  >;
  /**
   * Additional fields to return with
   * the server data.
   */
  expand?: ServerExpand;
  /**
   * Restrict the procedure to only allow
   * certain API key permissions.
   */
  permissions?: Partial<APIKeyPermissions>;
}

const t = initTRPC
  .meta<TRPCMeta>()
  .context<TRPCContext>()
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
    // [!] Disable attaching the inputs to the events.
    // This is to avoid sensitive data being attached to the events.
    attachRpcInput: false,
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
    // Disable ratelimit in development and for tests
    if (ratelimitConfig === false || t._config.isDev) {
      // Ratelimit is disabled for this endpoint
      // Skip and go to the next middleware
      return next();
    }

    const {
      requests,
      seconds,
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

/**
 * The API key behind a request, once verified.
 *
 * Derived from the endpoint rather than imported, so it tracks whatever Better
 * Auth's api-key plugin returns without this file knowing its internals.
 */
type VerifiedApiKey = NonNullable<
  Awaited<ReturnType<TRPCContext["authApi"]["verifyApiKey"]>>["key"]
>;

/**
 * The owner's account state, as far as authentication cares.
 *
 * Session authentication gets this for free: the admin plugin refuses to mint a
 * session for a banned user in `session.create.before`, and banning deletes the
 * sessions that already exist. An API key reaches neither - it is verified
 * against the `apiKey` table alone and holds no session to delete - so without
 * the lookup below, banning an abusive customer takes away their browser and
 * leaves their key with the run of the API.
 */
type ApiKeyOwner = {
  banned: boolean | null;
  banExpires: Date | null;
  offboardingStartedAt: Date | null;
  anonymizedAt: Date | null;
};

/**
 * Whether this account may authenticate at all.
 *
 * The ban half mirrors Better Auth exactly, expiry included: a ban with a date
 * that has passed is no ban, and lifting it is left to the sign-in path that
 * already does so rather than duplicated here. The other two are the point of
 * no return - once offboarding has claimed the account its servers are being
 * destroyed, and once it is anonymised there is no customer left to act as.
 *
 * A pending deletion is deliberately *not* on this list. A customer inside the
 * grace period can still sign in, precisely so they can call it off, and an API
 * key that stopped working days before the account did would say nothing about
 * why.
 */
const isLockedOut = ({
  banned,
  banExpires,
  offboardingStartedAt,
  anonymizedAt,
}: ApiKeyOwner): boolean => {
  if (offboardingStartedAt || anonymizedAt) return true;

  return Boolean(banned) && (!banExpires || banExpires.getTime() > Date.now());
};

/**
 * Authenticates a request by API key or by session, and hands both plus the
 * resolved `userId` to everything downstream.
 *
 * [!] Exactly one `next()` call, deliberately. tRPC infers the context a
 * middleware adds from the first `next()` it sees and takes that shape as the
 * whole truth - so two calls with different shapes do not produce a union, they
 * produce whichever came first. Building one object and returning it once is
 * what keeps `ctx.session` and `ctx.apiKey` honest about being nullable.
 *
 * TODO: Add OAuth
 */
const authMiddleware = t.middleware(async ({ ctx, next, meta }) => {
  let session: Session | null = null;
  let apiKey: VerifiedApiKey | null = null;
  let userId: string;

  if (ctx.apiKey) {
    const permissions = meta?.permissions;
    if (!permissions) {
      // No API key permissions were declared for this endpoint
      throw new TRPCError({
        code: "FORBIDDEN",
      });
    }

    const result = await ctx.authApi.verifyApiKey({
      body: {
        key: ctx.apiKey,
        permissions,
      },
    });

    if (!result.valid || !result.key?.referenceId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    apiKey = result.key;
    userId = result.key.referenceId;

    // [!] Authorization: a valid key is not enough - the account behind it has
    // to still be allowed in. See `isLockedOut`.
    const owner = await ctx.db
      .select({
        banned: users.banned,
        banExpires: users.banExpires,
        offboardingStartedAt: users.offboardingStartedAt,
        anonymizedAt: users.anonymizedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then(([row]) => row);

    if (!owner || isLockedOut(owner)) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    // An API key in use is the account in use. Without this, a customer who
    // drives everything through the API and never opens the dashboard reads as
    // dormant to the inactivity sweep.
    //
    // After the check rather than beside it: `touchLastSeen` also calls off a
    // pending inactivity deletion, and a banned key being retried by a script
    // must not keep resurrecting the account it belongs to.
    await touchLastSeen(ctx.db, userId);
  } else {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    Sentry.setUser({
      id: ctx.session.user.id,
      email: ctx.session.user.email,
      username: ctx.session.user.name,
    });

    // The spread is what makes `user` non-nullable.
    session = {
      ...ctx.session,
      user: ctx.session.user,
    };
    userId = ctx.session.user.id;
  }

  return next({ ctx: { session, apiKey, userId } });
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
    const result = await db.transaction(
      async (tx) => {
        // TODO: Use query api
        const server = await tx
          .select({
            id: servers.id,
            name: servers.name,
            vmid: servers.vmid,
            installed_at: servers.installedAt,
            suspended_at: servers.suspendedAt,
            terminates_at: servers.terminatesAt,
            abuse_locked_at: servers.abuseLockedAt,
            abuse_lock_level: servers.abuseLockLevel,
            created_at: servers.createdAt,
            plan: !expansions.has("plan")
              ? serverPlans.id
              : {
                  id: serverPlans.id,
                  name: serverPlans.name,
                  cores: serverPlans.cores,
                  memory: serverPlans.memory,
                  storage: serverPlans.storage,
                },
            price: !expansions.has("price")
              ? serverPlanPrices.id
              : {
                  id: serverPlanPrices.id,
                  purchase_price: serverPlanPrices.purchasePrice,
                  renewal_price: serverPlanPrices.renewalPrice,
                  purchase_discount_id: serverPlanPrices.purchaseDiscountId,
                  renewal_discount_id: serverPlanPrices.renewalDiscountId,
                },
            template: !expansions.has("template")
              ? proxmoxTemplates.id
              : {
                  id: proxmoxTemplates.id,
                  icon: proxmoxTemplates.icon,
                  name: proxmoxTemplates.name,
                },
            datacenter: !expansions.has("datacenter")
              ? datacenters.id
              : {
                  id: datacenters.id,
                  name: datacenters.name,
                },
            node: !expansions.has("node")
              ? proxmoxNodes.id
              : {
                  id: proxmoxNodes.id,
                  hostname: proxmoxNodes.hostname,
                  netrate: proxmoxNodes.netrate,
                  storage_description: proxmoxNodes.storageDescription,
                  memory_description: proxmoxNodes.memoryDescription,
                  cpu_description: proxmoxNodes.cpuDescription,
                },
            allocations: !expansions.has("allocations")
              ? sql<string[]>`
                    COALESCE(
                      JSON_AGG(DISTINCT ${subnetAllocations.id})
                      FILTER (WHERE ${subnetAllocations.id} IS NOT NULL),
                      '[]'
                    )
                  `
              : sql<
                  {
                    id: string;
                    subnet: {
                      id: string;
                      cidr: string;
                      gateway: string;
                      dns_reverse_zone: string | null;
                      family: 4 | 6;
                    };
                  }[]
                >`
                    COALESCE(
                      JSON_AGG(
                        DISTINCT JSONB_BUILD_OBJECT(
                          'id', ${subnetAllocations.id},
                          'subnet', JSONB_BUILD_OBJECT(
                            'id', ${subnets.id},
                            'cidr', ${subnets.cidr},
                            'gateway', ${subnets.gateway},
                            'dns_reverse_zone', ${subnets.dnsReverseZone},
                            'family', family(${subnets.cidr})
                          )
                        )
                      ) FILTER (WHERE ${subnetAllocations.id} IS NOT NULL),
                      '[]'
                    )
                  `,
            mount: !expansions.has("mount")
              ? proxmoxIsoDownloads.id
              : {
                  id: proxmoxIsoDownloads.id,
                  name: proxmoxIsoDownloads.name,
                  url: proxmoxIsoDownloads.url,
                  expires_at: proxmoxIsoDownloads.expiresAt,
                  finished_at: proxmoxIsoDownloads.finishedAt,
                  failed_at: proxmoxIsoDownloads.failedAt,
                },
            // Selected unconditionally, unlike `template` and `mount`: the
            // operating system is always reported, so its fallbacks have to be
            // readable even when the caller expanded neither.
            osSource: {
              detectedOsId: servers.detectedOsId,
              detectedOsName: servers.detectedOsName,
              detectedOsAt: servers.detectedOsAt,
              templateName: proxmoxTemplates.name,
              templateIcon: proxmoxTemplates.icon,
              mountName: proxmoxIsoDownloads.name,
              mountUrl: proxmoxIsoDownloads.url,
            },
            proxmoxNode: {
              id: proxmoxNodes.id,
              hostname: proxmoxNodes.hostname,
              fqdn: proxmoxNodes.fqdn,
              // [!] Sensitive data
              tokenID: proxmoxNodes.tokenID,
              tokenSecret: proxmoxNodes.tokenSecret,
              backupStorage: proxmoxNodes.backupStorage,
              isoDownloadStorage: proxmoxNodes.isoDownloadStorage,
              snippetStorage: proxmoxNodes.snippetStorage,
              importStorage: proxmoxNodes.importStorage,
              vmStorage: proxmoxNodes.vmStorage,
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
          .leftJoin(
            subnetAllocations,
            eq(subnetAllocations.serverId, servers.id),
          )
          .leftJoin(subnets, eq(subnetAllocations.subnetId, subnets.id))
          .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
          .innerJoin(
            serverPlanPrices,
            eq(servers.serverPlanPriceId, serverPlanPrices.id),
          )
          .leftJoin(
            proxmoxTemplates,
            eq(servers.proxmoxTemplateId, proxmoxTemplates.id),
          )
          .leftJoin(
            proxmoxIsoDownloads,
            eq(servers.proxmoxIsoDownloadId, proxmoxIsoDownloads.id),
          )
          .groupBy(
            servers.id,
            serverPlans.id,
            serverPlanPrices.id,
            proxmoxTemplates.id,
            datacenters.id,
            proxmoxNodes.id,
            proxmoxIsoDownloads.id,
          )
          .limit(1)
          .then(([row]) => row);

        if (!server) {
          // Server does not exist or user does not have access to it
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        return server;
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    // [!] Split sensitive data from server data
    const { proxmoxNode, osSource, ...row } = result;

    const server = {
      ...row,
      // The raw columns as well as the resolved object: detection needs the
      // timestamp to decide whether to re-probe, and a backup snapshots the id
      // and the name so it can still say what it contains years later.
      detectedOsId: osSource.detectedOsId,
      detectedOsName: osSource.detectedOsName,
      detectedOsAt: osSource.detectedOsAt,
      operating_system: resolveServerOperatingSystem({
        server: osSource,
        mount: { name: osSource.mountName, url: osSource.mountUrl },
        template: { name: osSource.templateName, icon: osSource.templateIcon },
      }),
    };

    if (meta?.forbiddenStates && meta.forbiddenStates.length > 0) {
      if (
        (meta.forbiddenStates.includes("suspended") && isSuspended(server)) ||
        (meta.forbiddenStates.includes("terminated") && isTerminated(server)) ||
        (meta.forbiddenStates.includes("installing") && isInstalling(server))
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Separate from the three above because it says why. A customer whose
      // firewall edit is refused with a bare FORBIDDEN files a support ticket;
      // one who is told there is an open abuse case goes and reads it.
      if (
        meta.forbiddenStates.includes("abuse-locked") &&
        server.abuse_locked_at
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ABUSE_LOCKED",
        });
      }
    }

    const instance = getProxmoxInstance(proxmoxNode);

    return next({
      ctx: {
        server,
        proxmoxNode,
        instance: {
          // biome-ignore lint/nursery/noMisusedPromises: wrong detection
          ...instance,
          vm: instance.node.qemu.$(server.vmid),
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

/**
 * A procedure that additionally requires a recent re-authentication.
 *
 * For the actions that cannot be taken back: erasing an account, or handing
 * over an archive of everything we hold about someone. A valid session is not enough
 * on its own, because a session is what an attacker who borrowed a laptop
 * already has.
 *
 * API keys can never satisfy this. A key is a bearer credential with no human
 * behind it at request time, so there is nobody to challenge - these actions
 * stay in the browser on purpose.
 */
export const stepUpProcedure = t.procedure
  .use(sentryMiddleware)
  .use(ratelimitMiddleware)
  .use(authMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This action cannot be performed with an API key.",
      });
    }

    if (!(await isStepUpSatisfied(ctx.session))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "STEP_UP_REQUIRED",
      });
    }

    return next({ ctx: { session: ctx.session } });
  });

export const serverProcedure = t.procedure
  .use(sentryMiddleware)
  .use(ratelimitMiddleware)
  // Server middleware already includes authMiddleware
  .use(serverMiddleware);
