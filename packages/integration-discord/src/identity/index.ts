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

import type { IdentityProvider, LinkedAccount } from "@virtbase/ports";
import type { DiscordContext } from "../config";
import { pushDiscordLinkedRoleMetadata } from "./push-linked-role-metadata";

export * from "./push-linked-role-metadata";

/**
 * Pushes role-connection metadata to Discord after an account is linked, which
 * is what lets a Discord server grant roles based on Virtbase data.
 *
 * Used to live in `@virtbase/auth` as `push-discord-linked-role-metadata.ts`;
 * the auth package now emits a provider-agnostic event and this reacts to it.
 */
export class DiscordIdentityProvider implements IdentityProvider {
  readonly providerId = "discord";
  readonly requiredScopes = ["role_connections.write"] as const;

  private readonly ctx: DiscordContext;

  constructor(ctx: DiscordContext) {
    this.ctx = ctx;
  }

  async onAccountLinked(account: LinkedAccount): Promise<void> {
    if (!account.accessToken) return;

    // Discord rejects the push without this scope, and users who linked before
    // it was requested still have accounts without it.
    if (!account.scopes.includes("role_connections.write")) return;

    await pushDiscordLinkedRoleMetadata({
      userId: account.userId,
      accessToken: account.accessToken,
      appId: this.ctx.settings.appId,
    });
  }
}
