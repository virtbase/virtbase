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

import * as Sentry from "@sentry/nextjs";
import { createSafeActionClient } from "next-safe-action";
import { verifySession } from "../api/verify-session";

export const actionClient = createSafeActionClient({
  handleServerError: (error) => {
    Sentry.captureException(error);

    return "An unknown error occurred.";
  },
})
  // Every action must be authenticated with admin privileges
  .use(async ({ ctx, next }) => {
    // [!] Asserts that the user has admin privileges
    const { session, user } = await verifySession();

    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    });

    return next({
      ctx: {
        ...ctx,
        session,
        user,
      },
    });
  });
