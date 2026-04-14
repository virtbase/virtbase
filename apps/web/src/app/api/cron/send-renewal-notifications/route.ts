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

import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, users } from "@virtbase/db/schema";
import { sendBatchEmail } from "@virtbase/email";
import ServerRenewalReminder from "@virtbase/email/templates/server-renewal-reminder";
import { getEmailTitle } from "@virtbase/email/translations";
import { SERVER_DELETION_GRACE_PERIOD_DAYS } from "@virtbase/utils";
import type { NextRequest } from "next/server";

/**
 * Checks for servers that are about to terminate and
 * sends a notification to the customer.
 *
 * Only sends one reminder per expiration period by tracking
 * `renewalReminderSentAt` on the server.
 */
async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  console.log(
    "[CRON] Starting to send renewal notifications to customers. Current time is:",
    new Date().toISOString(),
  );

  const upcomingTerminations = await db.transaction(
    async (tx) => {
      return tx
        .select({
          serverId: servers.id,
          serverName: servers.name,
          user: {
            name: users.name,
            email: users.email,
            locale: users.locale,
          },
        })
        .from(servers)
        .innerJoin(users, eq(servers.userId, users.id))
        .where(
          and(
            // Server has a termination date
            isNotNull(servers.terminatesAt),
            // Server is not suspended or will be suspended in the future
            or(
              isNull(servers.suspendedAt),
              gt(servers.suspendedAt, sql`now()`),
            ),
            // Current date > (termination date - deletion grace period)
            // => Server is about to be terminated in next n days
            gt(
              // Current date
              sql`DATE_TRUNC('day', now())`,

              // Before termination
              sql`(DATE_TRUNC('day', ${servers.terminatesAt}) - INTERVAL '${sql.raw(`${SERVER_DELETION_GRACE_PERIOD_DAYS}`)} days')`,
            ),
            // No reminder sent yet, or reminder was sent before the current expiration period started
            // (handles case where server was renewed and is expiring again)
            or(
              isNull(servers.renewalReminderSentAt),
              lt(
                servers.renewalReminderSentAt,
                sql`(${servers.terminatesAt} - INTERVAL '${sql.raw(`${SERVER_DELETION_GRACE_PERIOD_DAYS}`)} days')`,
              ),
            ),
          ),
        );
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  console.log(
    "[CRON] Found",
    upcomingTerminations.length,
    "servers to send renewal notifications to.",
  );

  if (upcomingTerminations.length === 0) {
    return new Response("OK", {
      status: 200,
    });
  }

  await sendBatchEmail(
    await Promise.all(
      upcomingTerminations.map(async ({ user, ...server }) => ({
        to: user.email,
        subject: await getEmailTitle("server-renewal-reminder", user.locale),
        react: await ServerRenewalReminder({
          serverName: server.serverName,
          serverId: server.serverId,
          name: user.name,
          email: user.email,
          locale: user.locale,
        }),
      })),
    ),
  );

  // Mark servers as having received a renewal reminder
  await db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({ renewalReminderSentAt: sql`now()` })
        .where(
          inArray(
            servers.id,
            upcomingTerminations.map((server) => server.serverId),
          ),
        );
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  return new Response("OK", {
    status: 200,
  });
}

export { handler as GET };
