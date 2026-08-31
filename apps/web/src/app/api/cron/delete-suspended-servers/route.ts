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
import { transitionSubjectSubscription } from "@virtbase/api/subscriptions";
import { deleteServerWorkflow } from "@virtbase/api/workflows";
import { and, eq, gte, isNotNull, lte, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, servers } from "@virtbase/db/schema";
import { SERVER_DELETION_GRACE_PERIOD_DAYS } from "@virtbase/utils";
import { start } from "workflow/api";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Checks for suspended servers that are past the deletion grace
 * period and queues them for deletion.
 *
 * `terminatesAt` is re-read rather than trusted to `suspendedAt` alone.
 * Suspension and renewal race: `/api/cron/suspend-terminated-servers` stamps
 * `suspended_at` in a trailing update that runs after a bulk shutdown, so a
 * renewal landing in between — which clears `suspended_at` and pushes
 * `terminates_at` out — can be overwritten by it. Without this predicate the
 * customer has paid, the term is live, and five days later the server is
 * destroyed anyway.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting deletion of suspended servers. Current time is:",
    new Date().toISOString(),
  );

  const suspendedServers = await db.transaction(
    async (tx) => {
      return tx
        .select({
          id: servers.id,
          vmid: servers.vmid,
          proxmoxNode: {
            hostname: proxmoxNodes.hostname,
            fqdn: proxmoxNodes.fqdn,
            // [!] Sensitive data
            tokenID: proxmoxNodes.tokenID,
            tokenSecret: proxmoxNodes.tokenSecret,
          },
        })
        .from(servers)
        .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
        .where(
          and(
            isNotNull(servers.suspendedAt),
            gte(
              sql`now()`,
              sql`(${servers.suspendedAt} + INTERVAL '${sql.raw(`${SERVER_DELETION_GRACE_PERIOD_DAYS}`)} days')`,
            ),
            // Still genuinely out of term. A server whose term has been pushed
            // back into the future has been paid for and must survive, however
            // old its `suspended_at` is.
            isNotNull(servers.terminatesAt),
            lte(servers.terminatesAt, sql`now()`),
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
    suspendedServers.length,
    "suspended servers to delete.",
  );

  // Closed here, before the destruction is even queued, rather than left to
  // the deletion step alone.
  //
  // `subscriptions.subject_id` is not a foreign key, so nothing in the
  // database notices a server going away - and this is the moment the outcome
  // is decided: the term ran out, the grace period ran out, and the machine is
  // going. Stopping the billing instruction at the earliest point it is known
  // to be dead, rather than at the end of a workflow that may take a while or
  // fail on an unreachable node, is what keeps a subscription from outliving
  // the decision to destroy its server.
  //
  // `storeServerDeletionStep` says the same thing again when the row actually
  // goes, which is what covers every other deletion route. That second call
  // finds a subscription that has already ended, does not match it, and is a
  // no-op - so the reason recorded is this one, which is the specific one.
  for (const server of suspendedServers) {
    try {
      await transitionSubjectSubscription(server.id, "ended", {
        reason: "grace_period_elapsed",
      });
    } catch (error) {
      // Reported, not thrown. The deletions below are the job; a subscription
      // that failed to close is caught again by the deletion step.
      console.error(
        "[CRON] Failed to end the subscription for server",
        server.id,
        error,
      );
      Sentry.captureException(error);
    }
  }

  await Promise.all(
    suspendedServers.map(({ proxmoxNode, ...server }) =>
      start(deleteServerWorkflow, [
        {
          vmid: server.vmid,
          serverId: server.id,
          proxmoxNode,
        },
      ]),
    ),
  );

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
