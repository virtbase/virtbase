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
import type { GetProxmoxInstanceParams, ProxmoxInstance } from "../proxmox";
import { getProxmoxInstance } from "../proxmox";
import { transitionSubjectSubscription } from "./subject-subscription";

/** The most servers one run suspends. The rest are suspended by the next run. */
export const SUSPENSION_BATCH_SIZE = 200;

/** The most Proxmox nodes one run talks to at the same time. */
export const SUSPENSION_NODE_CONCURRENCY = 4;

/**
 * How long one node may take to power off its servers before the run counts it
 * as failed and leaves its servers for the next run.
 */
export const NODE_POWER_OFF_TIMEOUT_MS = 60_000;

/** A Proxmox node and the credentials to reach it, as the sweep selects it. */
export interface SuspensionNode extends GetProxmoxInstanceParams {
  proxmoxNodeId: string;
}

/** A server whose term has run out. */
export type DueServer = Pick<typeof servers.$inferSelect, "id" | "vmid">;

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
  /** Servers on nodes whose power-off failed or timed out. Still due next run. */
  failedServerIds: string[];
  /** The nodes those servers are on. */
  failedNodeIds: string[];
  /** Subscriptions moved to `suspended`, this run's and earlier runs' alike. */
  subscriptionsSuspended: number;
  /** Subscriptions whose move failed. The next run selects them again. */
  subscriptionsFailed: number;
}

/** Groups due servers by their node, in the order the nodes first appear. */
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
 * Disables autostart on every server, then shuts them all down in one bulk
 * action. A failed autostart change is reported and does not stop the
 * shutdown; a failed shutdown rejects.
 */
export const powerOffServers = async (
  instance: ProxmoxInstance,
  dueServers: readonly DueServer[],
): Promise<void> => {
  await mapSettled(dueServers, { concurrency: 10 }, async (server) => {
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
    vms: dueServers.map((server) => server.vmid),
    "force-stop": true,
    maxworkers: 10,
  });
};

/** {@link powerOffServers} on the node the batch belongs to. */
export const powerOffOnProxmox: PowerOffServers = ({ node, servers }) =>
  powerOffServers(getProxmoxInstance(node), servers);

/** `promise`, or a rejection naming `operation` once `ms` have passed. */
const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  operation: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} timed out after ${ms} ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
 * Suspended servers whose live subscription is still `active` or `past_due`:
 * the subscription has not followed the server yet, either because this run
 * just suspended the server or because an earlier run failed to move it.
 */
const selectSubscriptionsToFollow = (limit: number) =>
  db
    .select({ serverId: servers.id })
    .from(servers)
    .where(
      and(
        isNotNull(servers.suspendedAt),
        sql`EXISTS (
          SELECT 1
            FROM ${subscriptions}
           WHERE ${subscriptions.subjectType} = 'server'
             AND ${subscriptions.subjectId} = ${servers.id}
             AND ${subscriptions.status} IN ('active', 'past_due')
        )`,
      ),
    )
    .limit(limit);

const markSuspended = (serverIds: string[]) =>
  db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({ suspendedAt: sql`now()` })
        .where(
          and(inArray(servers.id, serverIds), isNull(servers.suspendedAt)),
        );
    },
    { accessMode: "read write", isolationLevel: "read committed" },
  );

/**
 * Moves the server's live subscription to `suspended`. Returns whether it did;
 * a failure is reported, and the next run selects the subscription again.
 *
 * Suspended, not ended. The customer's term has run out and the machine is
 * off, but they have the deletion grace period to pay and get it back -
 * `suspended` is the one non-terminal state money can still fix, and `ended`
 * is terminal for every route in. Closing the subscription is what
 * `delete-suspended-servers` does once the grace period proves they did not
 * pay.
 */
const followSubscription = async (serverId: string): Promise<boolean> => {
  try {
    await transitionSubjectSubscription(serverId, "suspended", {
      reason: "term_elapsed",
    });
    return true;
  } catch (error) {
    console.error("[suspension] Failed to suspend the subscription", {
      serverId,
      error,
    });
    Sentry.captureException(error);
    return false;
  }
};

/**
 * Powers off and suspends the servers whose term has run out, then moves their
 * subscriptions to `suspended`.
 *
 * Each node is handled on its own, within `timeoutMs`, and its servers are
 * marked suspended as soon as its power-off succeeds. A node that fails or
 * hangs is reported, and its servers stay due for the next run. A run handles
 * at most `limit` servers, oldest term first.
 */
export const suspendTerminatedServers = async ({
  powerOff = powerOffOnProxmox,
  limit = SUSPENSION_BATCH_SIZE,
  concurrency = SUSPENSION_NODE_CONCURRENCY,
  timeoutMs = NODE_POWER_OFF_TIMEOUT_MS,
}: {
  powerOff?: PowerOffServers;
  limit?: number;
  concurrency?: number;
  timeoutMs?: number;
} = {}): Promise<SuspensionResult> => {
  const batches = groupByNode(await selectDueServers(limit));

  const outcomes = await mapSettled(batches, { concurrency }, async (batch) => {
    await withTimeout(
      powerOff(batch),
      timeoutMs,
      `Powering off servers on ${batch.node.proxmoxNodeId}`,
    );
    await markSuspended(batch.servers.map((server) => server.id));
  });

  const suspendedServerIds: string[] = [];
  const failedServerIds: string[] = [];
  const failedNodeIds: string[] = [];

  for (const [index, batch] of batches.entries()) {
    const serverIds = batch.servers.map((server) => server.id);
    const outcome = outcomes[index];
    if (outcome?.status === "fulfilled") {
      suspendedServerIds.push(...serverIds);
      continue;
    }

    failedServerIds.push(...serverIds);
    failedNodeIds.push(batch.node.proxmoxNodeId);
    console.error("[suspension] Failed to suspend the servers of a node", {
      proxmoxNodeId: batch.node.proxmoxNodeId,
      error: outcome?.reason,
    });
    Sentry.captureException(outcome?.reason);
  }

  // Sequential rather than concurrent: each transition opens its own
  // transaction and takes a row lock, and up to SUSPENSION_BATCH_SIZE of them
  // at once would starve the connection pool.
  let subscriptionsSuspended = 0;
  let subscriptionsFailed = 0;
  for (const { serverId } of await selectSubscriptionsToFollow(limit)) {
    if (await followSubscription(serverId)) subscriptionsSuspended += 1;
    else subscriptionsFailed += 1;
  }

  return {
    suspendedServerIds,
    failedServerIds,
    failedNodeIds,
    subscriptionsSuspended,
    subscriptionsFailed,
  };
};
