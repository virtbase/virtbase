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

import * as Sentry from "@sentry/core";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";

/**
 * Get the locale of a user by their email
 *
 * @param email The email of the user to get the locale for
 * @returns The locale of the user, or null if the user does not exist or has no locale set
 */
export async function getUserLocaleByEmail(
  email: string,
): Promise<string | null> {
  try {
    return await db.transaction(
      async (tx) => {
        return tx
          .select({ locale: users.locale })
          .from(users)
          .where(eq(users.email, email))
          .limit(1)
          .then(([res]) => res?.locale ?? null);
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );
  } catch (error) {
    Sentry.captureException(error);

    return null;
  }
}
