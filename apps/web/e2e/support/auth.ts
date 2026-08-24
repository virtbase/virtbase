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

import type { Cookie as PlaywrightCookie } from "@playwright/test";
import { initAuth } from "@virtbase/auth";
import { COOKIE_DOMAIN } from "@virtbase/utils";
import { testUtils } from "better-auth/plugins";

/**
 * A test-only better-auth instance carrying the `testUtils()` plugin.
 *
 * better-auth is explicit that `testUtils()` must not ship in the production
 * config - it exposes privileged server-side helpers on `ctx.test`. `initAuth`
 * already takes `additionalPlugins`, so the E2E setup builds its own instance
 * over the same database adapter instead of touching
 * `apps/web/src/lib/auth/server.ts`.
 */
const testAuth = initAuth({ additionalPlugins: [testUtils()] });

/**
 * Mint a real session for `userId` and return it as Playwright cookies.
 *
 * This is the whole reason the authenticated suite is cheap to run: no login
 * form, no email round-trip, no OTP scraping from stdout. The session row is
 * written to the same database the app reads, so the app cannot tell the
 * difference.
 *
 * The cookie domain matters. `COOKIE_DOMAIN` is `.virtbase.localhost` in
 * development, and a cookie scoped there is not sent to `localhost` - which is
 * why the suite drives `app.virtbase.localhost:3000` rather than a bare port.
 */
export async function sessionCookies(userId: string) {
  const ctx = await testAuth.$context;

  // `initAuth` types `additionalPlugins` as `BetterAuthPlugin[]`, which erases
  // the plugin's own types - better-auth's docs call this out and recommend
  // listing `testUtils()` statically instead, which would mean duplicating the
  // whole auth config here. Naming the one helper we use is the smaller price.
  const { test } = ctx as unknown as {
    test: {
      getCookies(input: {
        userId: string;
        domain?: string;
      }): Promise<PlaywrightCookie[]>;
    };
  };

  return await test.getCookies({ userId, domain: COOKIE_DOMAIN });
}
