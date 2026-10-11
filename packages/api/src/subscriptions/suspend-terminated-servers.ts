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
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, servers, subscriptions } from "@virtbase/db/schema";
import { mapSettled, RENEWAL_SUSPENSION_GRACE_DAYS } from "@virtbase/utils";
import type { GetProxmoxInstanceParams } from "../proxmox";
import { getProxmoxInstance } from "../proxmox";
import { transitionSubjectSubscription } from "./subject-subscription";

/** The most servers one run suspends. The rest are suspended by the next run. */
export const SUSPENSION_BATCH_SIZE = 200;

/** The most Proxmox nodes one run talks to at the same time. */
export const SUSPENSION_NODE_CONCURRENCY = 4;

export interface SuspensionNode extends GetProxmoxInstanceParams {
  proxmoxNodeId: string;
}

export interface DueServer {
  id: string;
  vmid: number;
}

/** The due servers of one node, powered off together. */
export interface NodeBatch {
  node: SuspensionNode;
  servers: DueServer[];
}

/**
 * Powers off every server of `batch` at the hypervisor. Rejects when the node
 * cannot be told to, which leaves the batch for the next run.
 */
export type PowerOffServers = (batch: NodeBatch) => Promise<void>;

export interface SuspensionResult {
  /** Servers powered off and marked suspended by this run. */
  suspendedServerIds: string[];
  /** Nodes whose power-off failed. Their servers stay due for the next run. */
  failedNodeIds: string[];
}

/** Groups due servers by their node, preserving the order of `rows`. */
export const groupByNode = (
  rows: readonly (DueServer & { node: SuspensionNode })[],
): NodeBatch[] => {
  const batches = new Map<string, NodeBatch>();
  for (const { node, ...server } of rows) {
    const batch = batches.get(node.proxmoxNodeId);
    if (batch) batch.servers.push(server);
    else batches.set(node.proxmoxNodeId, { node, servers: [server] });
  }
  return [...batches.values()];
};

/**
 * Disables autostart on every server of the batch, then shuts them all down in
 * one bulk action. A failed autostart change is reported and does not stop the
 * shutdown; a failed shutdown rejects.
 */
export const powerOffOnProxmox: PowerOffServers = async ({ node, servers }) => {
  const instance = getProxmoxInstance(node);

  await mapSettled(servers, { concurrency: 10 }, async (server) => {
    try {
      await instance.node.qemu.$(server.vmid).config.$put({ onboot: false });
    } catch (error) {
      console.error("[suspension] Failed to disable autostart", {
        serverId: server.id,
        error,
      });
      Sentry.captureException(error);
    }
  });

  await instance.cluster["bulk-action"].guest.shutdown.$post({
    vms: servers.map((server) => server.vmid),
    "force-stop": true,
    maxworkers: 10,
  });
};

const selectDueServers = (limit: number) =>
  db
    .select({
      id: servers.id,
      vmid: servers.vmid,
      node: {
        proxmoxNodeId: proxmoxNodes.id,
        hostname: proxmoxNodes.hostname,
        fqdn: proxmoxNodes.fqdn,
        tokenID: proxmoxNodes.tokenID,
        tokenSecret: proxmoxNodes.tokenSecret,
      },
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
    .orderBy(servers.terminatesAt)
    .limit(limit);

/**
 * Powers off and suspends the servers whose term has run out.
 *
 * Each node is handled on its own: a node that cannot be reached is reported
 * and its servers stay due, while every other node's servers are suspended.
 * A run handles at most `limit` servers, oldest term first.
 */
export const suspendTerminatedServers = async ({
  powerOff = powerOffOnProxmox,
  limit = SUSPENSION_BATCH_SIZE,
  concurrency = SUSPENSION_NODE_CONCURRENCY,
}: {
  powerOff?: PowerOffServers;
  limit?: number;
  concurrency?: number;
} = {}): Promise<SuspensionResult> => {
  const batches = groupByNode(await selectDueServers(limit));
  const outcomes = await mapSettled(batches, { concurrency }, powerOff);

  const suspendedServerIds: string[] = [];
  const failedNodeIds: string[] = [];

  for (const [index, batch] of batches.entries()) {
    const outcome = outcomes[index];
    if (outcome?.status === "fulfilled") {
      suspendedServerIds.push(...batch.servers.map((server) => server.id));
      continue;
    }

    failedNodeIds.push(batch.node.proxmoxNodeId);
    console.error("[suspension] Failed to power off servers on a node", {
      proxmoxNodeId: batch.node.proxmoxNodeId,
      error: outcome?.reason,
    });
    Sentry.captureException(outcome?.reason);
  }

  if (suspendedServerIds.length > 0) {
    await db.transaction(
      async (tx) => {
        await tx
          .update(servers)
          .set({ suspendedAt: sql`now()` })
          .where(
            and(
              inArray(servers.id, suspendedServerIds),
              isNull(servers.suspendedAt),
            ),
          );
      },
      { accessMode: "read write", isolationLevel: "read committed" },
    );
  }

  // Suspended, not ended. The customer's term has run out and the machine is
  // off, but they have the deletion grace period to pay and get it back -
  // `suspended` is the one non-terminal state money can still fix, and
  // `ended` is terminal for every route in. Ending here would close a
  // subscription the customer may be about to rescue, and closing it is what
  // `delete-suspended-servers` does once the grace period proves they did not.
  //
  // Sequential rather than concurrent: each of these opens its own
  // transaction and takes a row lock, and a fleet-wide suspension sweep firing
  // hundreds of them at once is how the connection pool starves. The
  // suspensions themselves are already committed by this point, so nothing
  // downstream is waiting on this.
  for (const serverId of suspendedServerIds) {
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
        "[suspension] Failed to suspend the subscription for server",
        serverId,
        error,
      );
      Sentry.captureException(error);
    }
  }

  return { suspendedServerIds, failedNodeIds };
};
