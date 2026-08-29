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
import { and, eq, inArray, isNull, lte, ne, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { abuseCases } from "@virtbase/db/schema";
import type { EnforcementLevel } from "@virtbase/ports";
import { dispatchNotification } from "../notifications/dispatch";
import { caseReference, recordCaseEvent, setCaseStatus } from "./case";
import type { VmResolver } from "./enforce";
import { enforceCase, releaseCase } from "./enforce";

type Database = typeof database;

/** Cases a clock can still move. */
const LIVE_STATUSES = [
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
] as const;

/**
 * One step tighter.
 *
 * Stops at `power_off`. `terminate` destroys the customer's data after a grace
 * period, and no clock running out is grounds for that on its own - it stays a
 * decision an operator makes and signs.
 */
const TIGHTER: Record<EnforcementLevel, EnforcementLevel> = {
  none: "throttle",
  throttle: "isolate",
  isolate: "power_off",
  power_off: "power_off",
  terminate: "terminate",
};

export interface ReconcileCasesResult {
  enforced: number;
  escalated: number;
  closed: number;
  failed: number;
}

/**
 * Advances every clock a case runs on.
 *
 * A cron rather than a page load, for the same reason backup reconciliation is
 * one: a deadline that only elapses while an operator happens to be looking at
 * the case is not a deadline. Three sweeps, in the order a case moves through
 * them.
 */
export const reconcileAbuseCases = async ({
  db,
  resolveVm,
  limit = 100,
}: {
  db: Database;
  resolveVm?: VmResolver;
  limit?: number;
}): Promise<ReconcileCasesResult> => {
  const result: ReconcileCasesResult = {
    enforced: 0,
    escalated: 0,
    closed: 0,
    failed: 0,
  };

  // 1. The grace window has run out. A case settled inside it is never
  //    enforced at all, which is the point of having one.
  const due = await db
    .select({ id: abuseCases.id })
    .from(abuseCases)
    .where(
      and(
        ne(abuseCases.enforcement, "none"),
        isNull(abuseCases.enforcedAt),
        lte(abuseCases.enforceAt, sql`now()`),
        inArray(abuseCases.status, [...LIVE_STATUSES]),
      ),
    )
    .limit(limit);

  for (const abuseCase of due) {
    try {
      const outcome = await enforceCase({
        db,
        caseId: abuseCase.id,
        ...(resolveVm ? { resolveVm } : {}),
      });
      if (outcome.locked > 0) result.enforced += 1;
      if (outcome.failed > 0) result.failed += 1;
    } catch (error) {
      result.failed += 1;
      Sentry.captureException(error);
    }
  }

  // 2. The customer was asked and did not answer.
  const overdue = await db
    .select({
      id: abuseCases.id,
      number: abuseCases.number,
      userId: abuseCases.userId,
      enforcement: abuseCases.enforcement,
    })
    .from(abuseCases)
    .where(
      and(
        eq(abuseCases.status, "awaiting_customer"),
        lte(abuseCases.respondBy, sql`now()`),
        isNull(abuseCases.escalatedAt),
      ),
    )
    .limit(limit);

  for (const abuseCase of overdue) {
    try {
      const tightened = TIGHTER[abuseCase.enforcement];

      await db
        .update(abuseCases)
        .set({
          escalatedAt: sql`now()`,
          enforcement: tightened,
          // Immediately: the grace window was the first notice, and it has
          // already been and gone.
          enforceAt: sql`now()`,
          enforcedAt: null,
        })
        .where(eq(abuseCases.id, abuseCase.id));

      await recordCaseEvent({
        db,
        caseId: abuseCase.id,
        type: "case.escalated",
        actorKind: "system",
        fromValue: abuseCase.enforcement,
        toValue: tightened,
        metadata: { reason: "no_response" },
      });

      await enforceCase({
        db,
        caseId: abuseCase.id,
        ...(resolveVm ? { resolveVm } : {}),
      });

      const reference = caseReference(abuseCase.number);

      await dispatchNotification({
        key: "abuse.case.escalated",
        audience: { kind: "operator" },
        severity: "critical",
        groupKey: `abuse:${abuseCase.id}:escalated`,
        url: `/abuse/${abuseCase.id}`,
        params: { reference, level: tightened, reason: "no response" },
      }).catch(() => undefined);

      result.escalated += 1;
    } catch (error) {
      result.failed += 1;
      Sentry.captureException(error);
    }
  }

  // 3. The customer said they fixed it, an operator agreed, and the watching
  //    window has passed without a new signal.
  const observed = await db
    .select({ id: abuseCases.id })
    .from(abuseCases)
    .where(
      and(
        eq(abuseCases.status, "mitigated"),
        lte(abuseCases.observeUntil, sql`now()`),
      ),
    )
    .limit(limit);

  for (const abuseCase of observed) {
    try {
      const moved = await setCaseStatus({
        db,
        caseId: abuseCase.id,
        status: "resolved",
        actorKind: "system",
        extra: {
          resolution: "fixed_by_customer",
          closedAt: new Date(),
          respondBy: null,
          observeUntil: null,
        },
        metadata: { reason: "observation_window_elapsed" },
      });

      if (!moved) continue;

      await releaseCase({
        db,
        caseId: abuseCase.id,
        ...(resolveVm ? { resolveVm } : {}),
      });

      result.closed += 1;
    } catch (error) {
      result.failed += 1;
      Sentry.captureException(error);
    }
  }

  return result;
};
