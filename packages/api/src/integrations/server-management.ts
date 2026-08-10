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
  ServerManagementActor,
  ServerManagementErrorCode,
  ServerManagementPort,
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
 * Implements {@link ServerManagementPort} on top of the tRPC router.
 *
 * This lives in the composition layer on purpose: it is the only thing that
 * knows both the port and `appRouter`. Integrations that manage servers — the
 * Discord bot today — depend on the interface and can fake it in tests, which
 * is what removes `@virtbase/api` from their dependency list (finding F11).
 *
 * Fabricating the caller session also moves here. It used to live inside
 * `@virtbase/discord`, which meant a plug-in was minting sessions for itself.
 */
export class TRPCServerManagement implements ServerManagementPort {
  async list(
    actor: ServerManagementActor,
    input: Parameters<ServerManagementPort["list"]>[1],
  ) {
    const caller = await this.callerFor(actor);
    return this.translate(() => caller.servers.list(input));
  }

  async get(
    actor: ServerManagementActor,
    input: Parameters<ServerManagementPort["get"]>[1],
  ) {
    const caller = await this.callerFor(actor);
    return this.translate(() => caller.servers.get(input));
  }

  async console(actor: ServerManagementActor, input: { server_id: string }) {
    const caller = await this.callerFor(actor);
    return this.translate(() => caller.servers.console.get(input));
  }

  async resetPassword(
    actor: ServerManagementActor,
    input: Parameters<ServerManagementPort["resetPassword"]>[1],
  ) {
    const caller = await this.callerFor(actor);
    await this.translate(() => caller.servers.actions.resetPassword(input));
  }

  /**
   * Builds a caller acting as the given user. The user is loaded fresh rather
   * than taken from the caller's argument so an integration cannot assert an
   * identity it did not look up.
   */
  private async callerFor(actor: ServerManagementActor): Promise<Caller> {
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
  }

  private async translate<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof TRPCError) {
        throw new ServerManagementError(
          ERROR_CODES[error.code] ?? "internal",
          error.message,
          { cause: error },
        );
      }
      throw error;
    }
  }
}
