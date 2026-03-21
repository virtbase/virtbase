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

import { captureException } from "@sentry/nextjs";
import { and, desc, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { verifySession } from "../verify-session";

export const getLatestCustomers = cache(async () => {
  "use cache: private";

  cacheLife("hours");
  cacheTag("admin", "admin-dashboard");

  await verifySession();

  try {
    const customers = await db.transaction(
      async (tx) =>
        tx
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            image: users.image,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(and(eq(users.role, "CUSTOMER")))
          .orderBy(desc(users.id))
          .limit(5),
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    return customers;
  } catch (error) {
    captureException(error);

    return [];
  }
});
