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

import { apiKeyClient } from "@better-auth/api-key/client";
import { passkeyClient } from "@better-auth/passkey/client";
import type { Auth } from "@virtbase/auth";
import { getSafeRedirectUrl } from "@virtbase/utils";
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  lastLoginMethodClient,
  magicLinkClient,
  twoFactorClient,
} from "better-auth/client/plugins";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<Auth>(),
    adminClient(),
    apiKeyClient(),
    emailOTPClient(),
    lastLoginMethodClient(),
    magicLinkClient(),
    passkeyClient(),
    twoFactorClient({
      onTwoFactorRedirect: () => {
        const { pathname, search, hash } = window.location;

        // `/login` and `/register` carry the real destination in `next`;
        // anywhere else *is* the destination. Forwarding the login page's own
        // URL sends the browser back through it after the challenge, so the
        // middleware has to bounce it a second time to get anywhere.
        const candidate = ["/login", "/register"].includes(pathname)
          ? new URLSearchParams(search).get("next")
          : `${pathname}${search}${hash}`;

        // Keeps CWE-601 closed: anything neither relative nor on a Virtbase
        // host collapses to the empty fallback and is dropped.
        const next = getSafeRedirectUrl(candidate, "");

        window.location.href =
          next && next !== "/" && !next.startsWith("/two-factor")
            ? `/two-factor?next=${encodeURIComponent(next)}`
            : "/two-factor";
      },
    }),
  ],
});

/**
 * A sign-in that still owes a second factor resolves with
 * `{ twoFactorRedirect: true }` and *no* session, and `onTwoFactorRedirect`
 * above has already started a hard navigation to `/two-factor` by the time the
 * promise settles.
 *
 * Every caller has to bail out on this. A `router.push()` that races that
 * navigation is answered by the middleware with no session cookie, which
 * redirects the browser back to `/login` — and on mobile, where the document
 * request loses to a middleware-only RSC response, that bounce is what commits.
 */
export function isTwoFactorRedirect(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "twoFactorRedirect" in data &&
    data.twoFactorRedirect === true
  );
}
