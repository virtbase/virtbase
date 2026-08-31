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
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { transitionSubjectSubscription } from "@virtbase/api/subscriptions";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes,
  servers,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import { sendBatchEmail } from "@virtbase/email";
import ServerSuspended from "@virtbase/email/templates/server-suspended";
import { getEmailTitle } from "@virtbase/email/translations";
import { RENEWAL_SUSPENSION_GRACE_DAYS } from "@virtbase/utils";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Checks for terminated servers, marks them as suspended
 * and shuts them down.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting suspension of terminated servers. Current time is:",
    new Date().toISOString(),
  );

  const nodesWithTerminatedServers = await db
    .select({
      proxmoxNodeId: proxmoxNodes.id,
      hostname: proxmoxNodes.hostname,
      fqdn: proxmoxNodes.fqdn,
      tokenID: proxmoxNodes.tokenID,
      tokenSecret: proxmoxNodes.tokenSecret,
      servers: sql<{ id: string; vmid: number }[]>`
      COALESCE(
        json_agg(
          json_build_object(
            'id', ${servers.id},
            'vmid', ${servers.vmid}
          )
        ),
        '[]'::json
      )
    `.as("servers"),
    })
    .from(servers)
    .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
    .where(
      and(
        isNotNull(servers.terminatesAt),
        isNull(servers.suspendedAt),
        gte(sql`now()`, servers.terminatesAt),
        // Leave the machine alone while automatic renewal is still trying to
        // pay for it.
        //
        // `current_period_end` is written equal to `terminates_at`, so both
        // fall due in the same instant. This sweep runs every fifteen minutes
        // and the renewal sweep hourly, so without this predicate the
        // suspension almost always wins - and because it moves the
        // subscription to `suspended`, which no claim accepts, the renewal is
        // then never attempted at all. The customer loses the server with a
        // working card on file and nothing ever retries.
        //
        // The window is bounded so a renewal system that has stopped running
        // cannot give service away indefinitely, and it closes on its own the
        // moment dunning gives up: exhaustion moves the subscription out of
        // `active`/`past_due`, this predicate stops matching, and the next run
        // powers the server off as usual.
        sql`NOT EXISTS (
          SELECT 1
            FROM ${subscriptions}
           WHERE ${subscriptions.subjectType} = 'server'
             AND ${subscriptions.subjectId} = ${servers.id}
             AND ${subscriptions.autoRenew}
             AND ${subscriptions.status} IN ('active', 'past_due')
             AND now() < ${servers.terminatesAt}
                       + make_interval(days => ${RENEWAL_SUSPENSION_GRACE_DAYS})
        )`,
      ),
    )
    .groupBy(proxmoxNodes.id);

  console.log(
    "[CRON] Found",
    nodesWithTerminatedServers.length,
    "nodes with terminated servers to suspend.",
  );

  const promises = nodesWithTerminatedServers.map(
    async ({ servers, ...node }) => {
      const instance = getProxmoxInstance(node);

      // Update all servers to not boot if host is rebooted
      // This change is synchronous and applied before the shutdown operation.
      await Promise.all(
        servers.map(async (server) => {
          try {
            const vm = instance.node.qemu.$(server.vmid);
            await vm.config.$put({
              onboot: false,
            });
          } catch (error) {
            console.error(error);
            Sentry.captureException(error);
          }
        }),
      );

      // Shutdown all servers (async operation)
      await instance.cluster["bulk-action"].guest.shutdown.$post({
        vms: servers.map((server) => server.vmid),
        "force-stop": true,
        maxworkers: 10,
      });
    },
  );

  await Promise.all(promises);

  const terminatedServerIds = nodesWithTerminatedServers.flatMap(
    ({ servers }) => servers.map((server) => server.id),
  );

  await db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({
          suspendedAt: sql`now()`,
        })
        .where(inArray(servers.id, terminatedServerIds));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  // Suspended, not ended. The customer's term has run out and the machine is
  // off, but they have the deletion grace period to pay and get it back -
  // `suspended` is the one non-terminal state money can still fix, and
  // `ended` is terminal for every route in. Ending here would close a
  // subscription the customer may be about to rescue, and closing it is what
  // `delete-suspended-servers` does once the grace period proves they did not.
  //
  // Sequential rather than `Promise.all`: each of these opens its own
  // transaction and takes a row lock, and a fleet-wide suspension sweep firing
  // hundreds of them at once is how the connection pool starves. The
  // suspensions themselves are already committed by this point, so nothing
  // downstream is waiting on this.
  for (const serverId of terminatedServerIds) {
    try {
      // Idempotent inside: a re-run finds a subscription already `suspended`,
      // which the state machine will not move to itself, and treats it as the
      // no-op it is. A subscription that has ended, or a server that never had
      // one, matches nothing at all.
      await transitionSubjectSubscription(serverId, "suspended", {
        reason: "term_elapsed",
      });
    } catch (error) {
      // The server is already suspended and committed; a subscription that
      // failed to follow is worth reporting, not worth failing a run that did
      // its actual work and will not see these servers again.
      console.error(
        "[CRON] Failed to suspend the subscription for server",
        serverId,
        error,
      );
      Sentry.captureException(error);
    }
  }

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
        .where(inArray(servers.id, terminatedServerIds));
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  // The suspensions are already committed, and a suspended server is not a
  // candidate on the next run - so failing the request here would lose these
  // notices for good and report a run that did most of its work as a failure.
  // `sendBatchEmail` rejects on a provider failure, so report and carry on.
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

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
