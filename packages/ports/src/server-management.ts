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

import type {
  GetServerConsoleOutputSchema,
  GetServerInputSchema,
  GetServerOutputSchema,
  ListServersInputSchema,
  ListServersOutputSchema,
  ResetServerPasswordServerInputSchema,
} from "@virtbase/validators/server";
import type * as z from "zod";

/**
 * Who the integration is acting on behalf of. Implementations are responsible
 * for the same ownership checks `serverProcedure` performs — a port is not a
 * way around authorization.
 */
export interface ServerManagementActor {
  userId: string;
}

/**
 * Why a server management call failed, in terms a caller can branch on without
 * knowing the transport. Mirrors the subset of tRPC error codes the Discord
 * handlers actually distinguish.
 */
export type ServerManagementErrorCode =
  | "not_found"
  | "forbidden"
  | "unauthorized"
  | "invalid_input"
  | "rate_limited"
  | "conflict"
  | "internal";

/**
 * Replaces the `TRPCError` checks the Discord handlers do today. Implementations
 * translate their own transport errors into this, so a consumer never imports
 * `@trpc/server` — or `@virtbase/api` — to tell "server is gone" from "the
 * request blew up".
 */
export class ServerManagementError extends Error {
  readonly code: ServerManagementErrorCode;

  constructor(
    code: ServerManagementErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ServerManagementError";
    this.code = code;
  }
}

/**
 * The surface an out-of-band client (Discord today, Telegram or a CLI later)
 * needs to manage servers.
 *
 * It is deliberately four methods rather than a tRPC caller. `@virtbase/discord`
 * currently imports `appRouter` from `@virtbase/api`, which points a Layer 4
 * plug-in at Layer 5; this port is the interface that replaces it, implemented
 * in the composition layer and fakeable in tests.
 *
 * Payload types are reused from `@virtbase/validators` so that implementation
 * stays a direct delegation and existing renderers keep compiling.
 *
 * Inputs are `z.input` and outputs are `z.output` on purpose: `sort` and
 * `expand` carry schema defaults, so callers must be allowed to omit them while
 * implementations still see them filled in.
 *
 * Every method rejects with a {@link ServerManagementError}.
 */
export interface ServerManagementPort {
  list(
    actor: ServerManagementActor,
    input: z.input<typeof ListServersInputSchema>,
  ): Promise<z.output<typeof ListServersOutputSchema>>;

  get(
    actor: ServerManagementActor,
    input: z.input<typeof GetServerInputSchema>,
  ): Promise<z.output<typeof GetServerOutputSchema>>;

  console(
    actor: ServerManagementActor,
    input: { server_id: string },
  ): Promise<z.output<typeof GetServerConsoleOutputSchema>>;

  resetPassword(
    actor: ServerManagementActor,
    input: z.input<typeof ResetServerPasswordServerInputSchema>,
  ): Promise<void>;
}

/** Convenience aliases so renderers do not re-derive these from the schemas. */
export type ManagedServer = z.output<typeof GetServerOutputSchema>["server"];
export type ManagedServerListItem = z.output<
  typeof ListServersOutputSchema
>["servers"][number];
