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

import * as Sentry from "@sentry/node";
import { eq, inArray } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, users } from "@virtbase/db/schema";
import { sendBatchEmail } from "@virtbase/email";
import ServerSuspended from "@virtbase/email/templates/server-suspended";
import { getEmailTitle } from "@virtbase/email/translations";

/**
 * Emails each customer whose server is in `serverIds` that the server has been
 * suspended.
 *
 * Never rejects. The suspensions are committed before this runs, and a
 * suspended server is not selected again, so failing the caller would not get
 * the notices sent; a delivery failure is reported to Sentry instead.
 */
export const notifySuspendedCustomers = async (
  serverIds: string[],
): Promise<void> => {
  if (serverIds.length === 0) return;

  try {
    const targets = await db.transaction(
      async (tx) =>
        tx
          .select({
            serverName: servers.name,
            serverId: servers.id,
            user: {
              name: users.name,
              email: users.email,
              locale: users.locale,
            },
          })
          .from(servers)
          .innerJoin(users, eq(servers.userId, users.id))
          .where(inArray(servers.id, serverIds)),
      { accessMode: "read only", isolationLevel: "read committed" },
    );

    await sendBatchEmail(
      await Promise.all(
        targets.map(async ({ user, serverName, serverId }) => ({
          to: user.email,
          subject: await getEmailTitle("server-suspended", user.locale),
          react: await ServerSuspended({
            serverName,
            serverId,
            name: user.name,
            email: user.email,
            locale: user.locale,
          }),
        })),
      ),
    );
  } catch (error) {
    console.error("[suspension] Failed to send suspension notices", {
      servers: serverIds.length,
      error,
    });
    Sentry.captureException(error);
  }
};
