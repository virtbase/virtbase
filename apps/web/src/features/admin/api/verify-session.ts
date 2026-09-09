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

import type { Session } from "@virtbase/auth";
import { isAdmin } from "@virtbase/auth/utils";
import { cacheLife } from "next/cache";
import { headers } from "next/headers";
import { notFound, unauthorized } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth/server";

/**
 * Applies the console's access rules to a session that has already been read.
 *
 * Kept apart from the reading so both callers below enforce exactly the same
 * two rules, and so neither of them can cache the decision itself - only the
 * verdict it produces.
 */
function assertAdmin(session: Session | null) {
  if (!session) {
    unauthorized();
  }

  // Hide the admin surface from authenticated non-admins (404, not 401).
  if (!isAdmin(session.user)) {
    notFound();
  }

  return session;
}

/**
 * Whether the viewer may see the console, cached in their own browser.
 *
 * This returns a verdict and nothing else. A `"use cache: private"` result is
 * held in the browser's memory, so the session it is derived from must not go
 * with it: that object carries the session token, which is otherwise confined
 * to an httpOnly cookie and must stay out of anything JavaScript can read.
 * Two booleans are all the render path needs.
 *
 * Five minutes is not arbitrary - Better Auth already serves this session from
 * a signed cookie cache with the same lifetime - but it does compound with it,
 * so nothing that *changes* anything is allowed to read this.
 */
async function readViewerVerdict() {
  "use cache: private";
  cacheLife({ stale: 300, revalidate: 300, expire: 300 });

  const session = await auth.api.getSession({ headers: await headers() });

  return {
    isAuthenticated: session != null,
    isAdmin: session != null && isAdmin(session.user),
  };
}

/**
 * The authoritative check, and the only one that returns a session.
 *
 * [!] Used in action-client.ts, which wraps every admin action.
 *
 * It deliberately re-reads rather than sharing the cache above. An
 * administrator whose access is withdrawn keeps the console *rendering* until
 * their private cache lapses, which is cosmetic; letting them keep *writing*
 * for the same window would not be.
 */
export const verifySession = cache(async () =>
  assertAdmin(await auth.api.getSession({ headers: await headers() })),
);

/**
 * The render-path check, for layouts and pages.
 *
 * Same two rules, decided from the private cache, so the console can prefetch
 * and navigate without waiting on a session read. It returns nothing on
 * purpose: no admin page uses the session, and a page that starts needing one
 * should reach for `verifySession` and accept the blocking read that implies.
 */
export const verifyRenderSession = cache(async () => {
  const { isAuthenticated, isAdmin: admin } = await readViewerVerdict();

  if (!isAuthenticated) {
    unauthorized();
  }

  if (!admin) {
    notFound();
  }
});
