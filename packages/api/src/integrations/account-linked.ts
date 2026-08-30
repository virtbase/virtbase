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

import type { AccountLinkedHandler } from "@virtbase/auth";

/**
 * Fans a linked social account out to every integration that implements the
 * `identity` port for that provider.
 *
 * Pass this to `initAuth({ onAccountLinked })`. It is the only place that knows
 * both better-auth's account hook and the integration registry, which is why it
 * lives here and not in `@virtbase/auth`.
 *
 * One integration failing must not stop the others, and none of them may fail
 * the login: errors are logged and dropped.
 */
export const dispatchAccountLinked: AccountLinkedHandler = async (account) => {
  // [!] Loaded here, not imported. `./index` re-exports this module, so a
  // static `import { integrations } from "./index"` makes this file evaluate
  // *during* that module's own initialisation - before `integrations` is
  // assigned. That is a temporal dead zone, and because it throws while the
  // module graph is still initialising it fails every consumer of the bundle,
  // not just this handler.
  const { integrations } = await import("./index");
  const providers = await integrations.resolveAll("identity");

  await Promise.all(
    providers
      .filter((provider) => provider.providerId === account.providerId)
      .map(async (provider) => {
        try {
          await provider.onAccountLinked(account);
        } catch (error) {
          console.error(
            `[integrations] identity provider "${provider.providerId}" failed for user ${account.userId}:`,
            error,
          );
        }
      }),
  );
};
