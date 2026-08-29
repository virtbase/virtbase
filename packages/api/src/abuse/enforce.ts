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
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import {
  abuseCaseServers,
  abuseCases,
  proxmoxNodes,
  servers,
  users,
} from "@virtbase/db/schema";
import type { EnforcementLevel } from "@virtbase/ports";
import { dispatchNotification } from "../notifications/dispatch";
import { getProxmoxInstance } from "../proxmox";
import { caseReference, recordCaseEvent } from "./case";
import type { ProxmoxVm, ServerLockPreviousState } from "./lock";
import {
  applyServerLock,
  isServerLockInForce,
  releaseServerLock,
} from "./lock";

type Database = typeof database;

/** A level that is actually applied to a guest. */
type AppliedLevel = Exclude<EnforcementLevel, "none" | "terminate">;

const isApplied = (level: EnforcementLevel): level is AppliedLevel =>
  "none" !== level && "terminate" !== level;

interface NodeCredentials {
  hostname: string;
  fqdn: string;
  tokenID: string;
  tokenSecret: string;
}

/**
 * How a server id becomes a hypervisor handle.
 *
 * Injected so the enforcement tests can drive the real database against a fake
 * Proxmox, which is the only way to assert that a failure to reach a node
 * leaves the row unlocked rather than pretending.
 */
export type VmResolver = (target: {
  vmid: number;
  proxmoxNode: NodeCredentials;
}) => ProxmoxVm;

const defaultVmResolver: VmResolver = ({ vmid, proxmoxNode }) =>
  getProxmoxInstance(proxmoxNode).node.qemu.$(vmid);

const caseServersToLock = (db: Database, caseId: string) =>
  db
    .select({
      id: abuseCaseServers.id,
      serverId: abuseCaseServers.serverId,
      lockLevel: abuseCaseServers.lockLevel,
      previousState: abuseCaseServers.previousState,
      vmid: servers.vmid,
      proxmoxNode: {
        hostname: proxmoxNodes.hostname,
        fqdn: proxmoxNodes.fqdn,
        tokenID: proxmoxNodes.tokenID,
        tokenSecret: proxmoxNodes.tokenSecret,
      },
    })
    .from(abuseCaseServers)
    .innerJoin(servers, eq(servers.id, abuseCaseServers.serverId))
    .innerJoin(proxmoxNodes, eq(proxmoxNodes.id, servers.proxmoxNodeId))
    .where(
      and(
        eq(abuseCaseServers.caseId, caseId),
        isNull(abuseCaseServers.releasedAt),
      ),
    );

export interface EnforceCaseResult {
  locked: number;
  failed: number;
  level: EnforcementLevel;
}

/**
 * Applies whatever a case decided to every server it implicates.
 *
 * Separate from the intake that decided it, and deliberately so: deciding is a
 * database transaction and applying is a series of calls to hypervisors that
 * may be unreachable. A node being down must leave the row unlocked so the
 * next reconciliation retries, not leave a case claiming an enforcement that
 * was never applied.
 */
export const enforceCase = async ({
  db,
  caseId,
  actorKind = "system",
  actorUserId = null,
  resolveVm = defaultVmResolver,
}: {
  db: Database;
  caseId: string;
  actorKind?: "operator" | "system";
  actorUserId?: string | null;
  resolveVm?: VmResolver;
}): Promise<EnforceCaseResult> => {
  const abuseCase = await db
    .select({
      id: abuseCases.id,
      number: abuseCases.number,
      userId: abuseCases.userId,
      enforcement: abuseCases.enforcement,
      blocksOrdering: abuseCases.blocksOrdering,
      staleAttribution: abuseCases.staleAttribution,
    })
    .from(abuseCases)
    .where(eq(abuseCases.id, caseId))
    .limit(1)
    .then(([first]) => first);

  if (!abuseCase) throw new Error(`Unknown abuse case "${caseId}"`);

  const level = abuseCase.enforcement;

  if ("none" === level) return { locked: 0, failed: 0, level };

  // The address resolved to somebody who no longer holds it. The server on it
  // today belongs to a customer who did nothing, and no rule outranks that.
  if (abuseCase.staleAttribution) {
    await recordCaseEvent({
      db,
      caseId,
      type: "enforcement.skipped",
      actorKind: "system",
      toValue: level,
      metadata: { reason: "stale_attribution" },
    });
    return { locked: 0, failed: 0, level: "none" };
  }

  const targets = await caseServersToLock(db, caseId);

  let locked = 0;
  let failed = 0;

  for (const target of targets) {
    try {
      if ("terminate" === level) {
        // Not a hypervisor lock. It hands the server to the lifecycle that
        // already suspends and then deletes, grace period included.
        await db
          .update(servers)
          .set({ terminatesAt: sql`now()` })
          .where(eq(servers.id, target.serverId));
      } else if (isApplied(level)) {
        const vm = resolveVm({
          vmid: target.vmid,
          proxmoxNode: target.proxmoxNode,
        });

        const previous = await applyServerLock({
          vm,
          level,
          previous:
            (target.previousState as ServerLockPreviousState | null) ?? null,
        });

        await db
          .update(abuseCaseServers)
          .set({
            lockLevel: level,
            lockedAt: sql`now()`,
            lastAssertedAt: sql`now()`,
            previousState: previous,
          })
          .where(eq(abuseCaseServers.id, target.id));

        // Denormalised so `serverMiddleware` can answer "is this locked" on
        // every server call without growing a join.
        await db
          .update(servers)
          .set({ abuseLockedAt: sql`now()`, abuseLockLevel: level })
          .where(eq(servers.id, target.serverId));
      }

      locked += 1;

      await recordCaseEvent({
        db,
        caseId,
        type: "enforcement.applied",
        actorKind,
        actorUserId,
        toValue: level,
        metadata: { serverId: target.serverId },
      });
    } catch (error) {
      failed += 1;
      Sentry.captureException(error, {
        tags: { "abuse.enforce": level, "abuse.case": caseId },
      });

      await recordCaseEvent({
        db,
        caseId,
        type: "enforcement.failed",
        actorKind: "system",
        toValue: level,
        metadata: {
          serverId: target.serverId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  if (locked > 0) {
    await db
      .update(abuseCases)
      .set({ enforcedAt: sql`now()`, releasedAt: null })
      .where(eq(abuseCases.id, caseId));
  }

  if (abuseCase.blocksOrdering && abuseCase.userId) {
    await db
      .update(users)
      .set({
        orderingBlockedAt: sql`now()`,
        orderingBlockReason: `Abuse case ${caseReference(abuseCase.number)}`,
      })
      .where(eq(users.id, abuseCase.userId));
  }

  const reference = caseReference(abuseCase.number);

  if (abuseCase.userId) {
    await dispatchNotification({
      // Distinct from the operator key below: the customer is being told their
      // service was restricted, which is not the same message as "a case
      // enforced" and is the only one of the two that is translated.
      key: "abuse.case.restricted",
      audience: { kind: "user", userId: abuseCase.userId },
      severity: "critical",
      groupKey: `abuse:${caseId}:enforced:${level}`,
      url: `/abuse/${caseId}`,
      params: { reference, level, servers: locked },
    }).catch(() => undefined);
  }

  await dispatchNotification({
    key: "abuse.case.enforced",
    audience: { kind: "operator" },
    severity: "critical",
    groupKey: `abuse:${caseId}:enforced:${level}`,
    url: `/abuse/${caseId}`,
    params: { reference, level, servers: locked, failed },
  }).catch(() => undefined);

  return { locked, failed, level };
};

export interface ReleaseCaseResult {
  released: number;
  failed: number;
}

/**
 * Undoes everything a case applied.
 *
 * Restores the guest to what it was rather than to a default, and lifts the
 * ordering block only when no other live case still needs it - a customer with
 * two open cases must not be un-blocked by settling one of them.
 */
export const releaseCase = async ({
  db,
  caseId,
  actorKind = "system",
  actorUserId = null,
  resolveVm = defaultVmResolver,
}: {
  db: Database;
  caseId: string;
  actorKind?: "operator" | "system";
  actorUserId?: string | null;
  resolveVm?: VmResolver;
}): Promise<ReleaseCaseResult> => {
  const abuseCase = await db
    .select({
      id: abuseCases.id,
      number: abuseCases.number,
      userId: abuseCases.userId,
    })
    .from(abuseCases)
    .where(eq(abuseCases.id, caseId))
    .limit(1)
    .then(([first]) => first);

  if (!abuseCase) throw new Error(`Unknown abuse case "${caseId}"`);

  const targets = await caseServersToLock(db, caseId);

  let released = 0;
  let failed = 0;

  for (const target of targets) {
    try {
      if (isApplied(target.lockLevel)) {
        await releaseServerLock({
          vm: resolveVm({
            vmid: target.vmid,
            proxmoxNode: target.proxmoxNode,
          }),
          level: target.lockLevel,
          previous:
            (target.previousState as ServerLockPreviousState | null) ?? null,
        });
      }

      await db
        .update(abuseCaseServers)
        .set({
          lockLevel: "none",
          releasedAt: sql`now()`,
          previousState: null,
        })
        .where(eq(abuseCaseServers.id, target.id));

      await db
        .update(servers)
        .set({ abuseLockedAt: null, abuseLockLevel: null })
        .where(eq(servers.id, target.serverId));

      released += 1;
    } catch (error) {
      failed += 1;
      Sentry.captureException(error, {
        tags: { "abuse.release": target.lockLevel, "abuse.case": caseId },
      });
    }
  }

  await db
    .update(abuseCases)
    .set({ releasedAt: sql`now()` })
    .where(eq(abuseCases.id, caseId));

  // Nothing to unblock on a case that never had a customer.
  if (!abuseCase.userId) {
    await recordCaseEvent({
      db,
      caseId,
      type: "enforcement.released",
      actorKind,
      actorUserId,
      metadata: { released, failed },
    });
    return { released, failed };
  }

  // Another open case may still be blocking this customer.
  const stillBlocked = await db
    .select({ id: abuseCases.id })
    .from(abuseCases)
    .where(
      and(
        eq(abuseCases.userId, abuseCase.userId),
        eq(abuseCases.blocksOrdering, true),
        ne(abuseCases.id, caseId),
        inArray(abuseCases.status, [
          "triage",
          "open",
          "awaiting_customer",
          "awaiting_operator",
          "mitigated",
        ]),
      ),
    )
    .limit(1)
    .then(([first]) => first);

  if (!stillBlocked) {
    await db
      .update(users)
      .set({ orderingBlockedAt: null, orderingBlockReason: null })
      .where(eq(users.id, abuseCase.userId));
  }

  await recordCaseEvent({
    db,
    caseId,
    type: "enforcement.released",
    actorKind,
    actorUserId,
    metadata: { released, failed },
  });

  return { released, failed };
};

export interface ReconcileLocksResult {
  checked: number;
  drifted: number;
  failed: number;
}

/**
 * Re-asserts every lock that is no longer in force.
 *
 * A lock the customer can delete is not a lock, and they can: the firewall
 * options and the network device are both on their own API. Applying once and
 * hoping is the difference between an abuse desk and a formality.
 *
 * Drift is counted rather than merely corrected. A customer removing the same
 * lock three times is not a bug report, it is evidence, and the count is what
 * an operator escalates on.
 */
export const reconcileAbuseLocks = async ({
  db,
  resolveVm = defaultVmResolver,
  limit = 200,
}: {
  db: Database;
  resolveVm?: VmResolver;
  limit?: number;
}): Promise<ReconcileLocksResult> => {
  const locked = await db
    .select({
      id: abuseCaseServers.id,
      caseId: abuseCaseServers.caseId,
      serverId: abuseCaseServers.serverId,
      lockLevel: abuseCaseServers.lockLevel,
      previousState: abuseCaseServers.previousState,
      driftCount: abuseCaseServers.driftCount,
      caseNumber: abuseCases.number,
      vmid: servers.vmid,
      proxmoxNode: {
        hostname: proxmoxNodes.hostname,
        fqdn: proxmoxNodes.fqdn,
        tokenID: proxmoxNodes.tokenID,
        tokenSecret: proxmoxNodes.tokenSecret,
      },
    })
    .from(abuseCaseServers)
    .innerJoin(abuseCases, eq(abuseCases.id, abuseCaseServers.caseId))
    .innerJoin(servers, eq(servers.id, abuseCaseServers.serverId))
    .innerJoin(proxmoxNodes, eq(proxmoxNodes.id, servers.proxmoxNodeId))
    .where(
      and(
        isNull(abuseCaseServers.releasedAt),
        isNotNull(abuseCaseServers.lockedAt),
        ne(abuseCaseServers.lockLevel, "none"),
      ),
    )
    .limit(limit);

  const result: ReconcileLocksResult = {
    checked: locked.length,
    drifted: 0,
    failed: 0,
  };

  for (const row of locked) {
    if (!isApplied(row.lockLevel)) continue;

    try {
      const vm = resolveVm({ vmid: row.vmid, proxmoxNode: row.proxmoxNode });

      if (await isServerLockInForce({ vm, level: row.lockLevel })) {
        await db
          .update(abuseCaseServers)
          .set({ lastAssertedAt: sql`now()` })
          .where(eq(abuseCaseServers.id, row.id));
        continue;
      }

      await applyServerLock({
        vm,
        level: row.lockLevel,
        previous: (row.previousState as ServerLockPreviousState | null) ?? null,
      });

      await db
        .update(abuseCaseServers)
        .set({
          lastAssertedAt: sql`now()`,
          driftCount: sql`${abuseCaseServers.driftCount} + 1`,
        })
        .where(eq(abuseCaseServers.id, row.id));

      result.drifted += 1;

      await recordCaseEvent({
        db,
        caseId: row.caseId,
        type: "lock.drift",
        actorKind: "system",
        toValue: row.lockLevel,
        metadata: { serverId: row.serverId, driftCount: row.driftCount + 1 },
      });

      await dispatchNotification({
        key: "abuse.lock.drift_detected",
        audience: { kind: "operator" },
        severity: "critical",
        // Per drift, not per case: the second time is the interesting one.
        groupKey: `abuse:${row.caseId}:drift:${row.driftCount + 1}`,
        url: `/abuse/${row.caseId}`,
        params: {
          reference: caseReference(row.caseNumber),
          level: row.lockLevel,
          serverId: row.serverId,
          driftCount: row.driftCount + 1,
        },
      }).catch(() => undefined);
    } catch (error) {
      result.failed += 1;
      Sentry.captureException(error, {
        tags: { "abuse.reconcile": row.lockLevel },
      });
    }
  }

  return result;
};
