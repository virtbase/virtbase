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
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { createId } from "@virtbase/db/utils";
import type {
  ServerBackupOperations,
  ServerFirewallOperations,
  ServerGraphOperations,
  ServerLifecycleOperations,
  ServerManagementActor,
  ServerManagementErrorCode,
  ServerManagementPort,
  ServerMountOperations,
  ServerRdnsOperations,
  ServerStatusOperations,
} from "@virtbase/ports";
import { ServerManagementError } from "@virtbase/ports";
import type { AppRouter } from "../root";
import { appRouter } from "../root";

type Caller = ReturnType<AppRouter["createCaller"]>;

const ERROR_CODES: Record<TRPCError["code"], ServerManagementErrorCode> = {
  PARSE_ERROR: "invalid_input",
  BAD_REQUEST: "invalid_input",
  UNPROCESSABLE_CONTENT: "invalid_input",
  PAYLOAD_TOO_LARGE: "invalid_input",
  UNSUPPORTED_MEDIA_TYPE: "invalid_input",
  UNAUTHORIZED: "unauthorized",
  PAYMENT_REQUIRED: "forbidden",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  METHOD_NOT_SUPPORTED: "invalid_input",
  TIMEOUT: "internal",
  CONFLICT: "conflict",
  PRECONDITION_FAILED: "conflict",
  PRECONDITION_REQUIRED: "conflict",
  TOO_MANY_REQUESTS: "rate_limited",
  CLIENT_CLOSED_REQUEST: "internal",
  INTERNAL_SERVER_ERROR: "internal",
  NOT_IMPLEMENTED: "internal",
  BAD_GATEWAY: "internal",
  SERVICE_UNAVAILABLE: "internal",
  GATEWAY_TIMEOUT: "internal",
};

/**
 * Builds a caller acting as the given user. The user is loaded fresh rather
 * than taken from the caller's argument so an integration cannot assert an
 * identity it did not look up.
 */
const callerFor = async (actor: ServerManagementActor): Promise<Caller> => {
  const user = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      image: users.image,
      role: users.role,
      stripeCustomerId: users.stripeCustomerId,
      locale: users.locale,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1)
    .then(([row]) => row);

  if (!user) {
    throw new ServerManagementError(
      "unauthorized",
      `No user with id ${actor.userId}`,
    );
  }

  return appRouter.createCaller({
    db,
    authApi: {} as never,
    headers: new Headers(),
    setHeader: () => {},
    apiKey: null,
    session: {
      session: {
        id: createId({ prefix: "sess_" }),
        token: "__unused_port_session_token__",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        updatedAt: new Date(),
        userId: user.id,
      },
      user,
    },
  });
};

/**
 * Every port method is the same three steps — build a caller, invoke one
 * procedure, translate the error. `bind` turns that into a one-liner per
 * method, which is what keeps this file a delegation table rather than a
 * hundred near-identical blocks.
 *
 * `select` receives the caller and returns the procedure to invoke; the input
 * is passed through untouched, so the port's `z.input` and the procedure's
 * schema stay the single shared contract.
 */
const bind =
  <TInput, TOutput>(
    select: (caller: Caller) => (input: TInput) => Promise<TOutput>,
  ) =>
  async (actor: ServerManagementActor, input: TInput): Promise<TOutput> => {
    const caller = await callerFor(actor);

    try {
      return await select(caller)(input);
    } catch (error) {
      if (error instanceof TRPCError) {
        const cause = error.cause;
        const detail =
          cause instanceof Error && cause.message ? `: ${cause.message}` : "";

        throw new ServerManagementError(
          ERROR_CODES[error.code] ?? "internal",
          `${error.message}${detail}`,
          { cause: error },
        );
      }
      throw error;
    }
  };

/**
 * Implements {@link ServerManagementPort} on top of the tRPC router.
 *
 * This lives in the composition layer on purpose: it is the only thing that
 * knows both the port and `appRouter`. Integrations that manage servers — the
 * Discord bot today — depend on the interface and can fake it in tests, which
 * is what removes `@virtbase/api` from their dependency list.
 *
 * Fabricating the caller session also lives here. It used to live inside
 * `@virtbase/discord`, which meant a plug-in was minting sessions for itself.
 */
export class TRPCServerManagement implements ServerManagementPort {
  readonly list = bind((caller) => caller.servers.list);
  readonly get = bind((caller) => caller.servers.get);
  readonly console = bind((caller) => caller.servers.console.get);
  readonly resetPassword = bind(
    (caller) => caller.servers.actions.resetPassword,
  );

  readonly status: ServerStatusOperations = {
    get: bind((caller) => caller.servers.status.get),
    update: bind((caller) => caller.servers.status.update),
  };

  readonly graphs: ServerGraphOperations = {
    get: bind((caller) => caller.servers.graphs.get),
  };

  readonly backups: ServerBackupOperations = {
    list: bind((caller) => caller.servers.backups.list),
    get: bind((caller) => caller.servers.backups.get),
    create: bind((caller) => caller.servers.backups.create),
    update: bind((caller) => caller.servers.backups.update),
    delete: bind((caller) => caller.servers.backups.delete),
    restore: bind((caller) => caller.servers.backups.restore),
  };

  readonly rdns: ServerRdnsOperations = {
    list: bind((caller) => caller.servers.rdns.list),
    upsert: bind((caller) => caller.servers.rdns.upsert),
    delete: bind((caller) => caller.servers.rdns.delete),
  };

  readonly firewall: ServerFirewallOperations = {
    options: {
      get: bind((caller) => caller.servers.firewall.options.get),
      update: bind((caller) => caller.servers.firewall.options.update),
    },
    rules: {
      list: bind((caller) => caller.servers.firewall.rules.get),
      create: bind((caller) => caller.servers.firewall.rules.create),
      update: bind((caller) => caller.servers.firewall.rules.update),
      delete: bind((caller) => caller.servers.firewall.rules.delete),
      move: bind((caller) => caller.servers.firewall.rules.move),
    },
  };

  readonly mounts: ServerMountOperations = {
    list: bind((caller) => caller.iso.list),
    mount: bind((caller) => caller.servers.mounts.mount),
    unmount: bind((caller) => caller.servers.mounts.unmount),
  };

  readonly lifecycle: ServerLifecycleOperations = {
    rename: bind((caller) => caller.servers.rename),
    changeTemplate: bind((caller) => caller.servers.actions.changeTemplate),
    plan: bind((caller) => caller.servers.plan.get),
    templateGroups: bind((caller) => caller.servers.templateGroups.get),
    advanced: {
      get: bind((caller) => caller.servers.advanced.get),
      update: bind((caller) => caller.servers.advanced.update),
    },
  };
}
