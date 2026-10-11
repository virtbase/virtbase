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
import { suspendTerminatedServers } from "@virtbase/api/subscriptions";
import { eq, inArray } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, users } from "@virtbase/db/schema";
import { sendBatchEmail } from "@virtbase/email";
import ServerSuspended from "@virtbase/email/templates/server-suspended";
import { getEmailTitle } from "@virtbase/email/translations";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Emails each customer whose server this run suspended.
 *
 * The suspensions are already committed, and a suspended server is not a
 * candidate on the next run - so failing the request here would lose these
 * notices for good and report a run that did most of its work as a failure.
 * `sendBatchEmail` rejects on a provider failure, so report and carry on.
 */
const notifySuspendedCustomers = async (serverIds: string[]) => {
  if (serverIds.length === 0) return;

  const notificationTargets = await db.transaction(
    async (tx) => {
      return tx
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
        .where(inArray(servers.id, serverIds));
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  try {
    await sendBatchEmail(
      await Promise.all(
        notificationTargets.map(async ({ user, ...server }) => ({
          to: user.email,
          subject: await getEmailTitle("server-suspended", user.locale),
          react: await ServerSuspended({
            serverName: server.serverName,
            serverId: server.serverId,
            name: user.name,
            email: user.email,
            locale: user.locale,
          }),
        })),
      ),
    );
  } catch (error) {
    console.error(
      "[CRON] Failed to send",
      notificationTargets.length,
      "suspension notice(s): ",
      error,
    );
    Sentry.captureException(error);
  }
};

/**
 * Powers off and suspends the servers whose term has run out, at most
 * `SUSPENSION_BATCH_SIZE` per run, and emails their owners. A node that cannot
 * be reached is reported and retried by the next run; it does not stop the
 * other nodes (`suspendTerminatedServers`).
 */
const handler = withCronSecret(async () => {
  const { suspendedServerIds, failedNodeIds } =
    await suspendTerminatedServers();

  await notifySuspendedCustomers(suspendedServerIds);

  return Response.json({
    suspended: suspendedServerIds.length,
    failedNodes: failedNodeIds.length,
  });
});

export { handler as GET };
