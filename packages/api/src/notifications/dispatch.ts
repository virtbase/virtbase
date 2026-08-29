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

import { createHash, randomUUID } from "node:crypto";
import { db } from "@virtbase/db/client";
import { notificationDeliveries } from "@virtbase/db/schema";
import type {
  NotificationAudience,
  NotificationSeverity,
} from "@virtbase/ports";
import { deliverNotification } from "./deliver";
import { matchesAnyKey, meetsSeverity } from "./match";
import { notificationTargetStore } from "./store";
import type { NotificationParams } from "./text";

export interface DispatchNotificationInput {
  /** Dotted key, e.g. `abuse.case.opened`. Must have text registered for it. */
  key: string;
  audience: NotificationAudience;
  severity: NotificationSeverity;
  params?: NotificationParams;
  /** Deep link into the customer portal or admin console. */
  url?: string;
  /**
   * Groups every notification about one thing, e.g. `abuse:abus_01J...`.
   *
   * Doubles as the deduplication scope: with a group key, the same key is
   * delivered to the same destination once per group and never again. Without
   * one, every dispatch is a new message.
   */
  groupKey?: string;
  /** Overrides the derived deduplication key, for callers that need their own. */
  dedupeKey?: string;
}

export interface DispatchResult {
  created: number;
  /** Suppressed because this key had already gone to that destination. */
  deduplicated: number;
  delivered: number;
  skipped: number;
  failed: number;
}

interface Candidate {
  channel: string;
  targetId: string | null;
}

const audienceKey = (audience: NotificationAudience): string =>
  "user" === audience.kind
    ? `user:${audience.userId}`
    : `operator:${audience.targetId ?? "*"}`;

const derivedDedupeKey = (
  input: DispatchNotificationInput,
  candidate: Candidate,
): string => {
  const scope = input.dedupeKey ?? input.groupKey;
  if (!scope) return randomUUID();

  return createHash("sha256")
    .update(
      [
        input.key,
        audienceKey(input.audience),
        scope,
        candidate.channel,
        candidate.targetId ?? "-",
      ].join("|"),
    )
    .digest("hex");
};

/**
 * Which destinations this notification is going to.
 *
 * A customer's channels are discovered by asking each one whether it can reach
 * them, so linking a Discord account is all it takes to start receiving there.
 * Operator destinations are configured rows instead, because there is no
 * person to ask.
 */
const resolveCandidates = async (
  input: DispatchNotificationInput,
): Promise<Candidate[]> => {
  // See `deliver.ts`: the registry reaches back into this module, so it is
  // resolved at call time rather than imported.
  const { integrations } = await import("../integrations");
  const channels = await integrations.resolveAll("notifications");

  if ("user" === input.audience.kind) {
    const supported = await Promise.all(
      channels.map(async (channel) =>
        (await channel.supports(input.audience)) ? channel.id : null,
      ),
    );

    return supported
      .filter((id): id is string => null !== id)
      .map((channel) => ({ channel, targetId: null }));
  }

  if (!notificationTargetStore) {
    console.warn(
      "[notifications] CONFIG_ENCRYPTION_KEY is not set, so operator targets cannot be read.",
    );
    return [];
  }

  const targets = await notificationTargetStore.list();
  const wanted = input.audience.targetId;

  return targets
    .filter((target) => {
      if (!target.enabled || "operator" !== target.audience) return false;

      // Addressing one target by id means "this one" - the routing rules are
      // how a notification finds its audience, not a second veto over a
      // decision the caller has already made. This is what lets the admin
      // console send a test to a target that subscribes to nothing yet.
      if (wanted) return target.id === wanted;

      return (
        matchesAnyKey(target.matchKeys, input.key) &&
        meetsSeverity(target.minSeverity, input.severity)
      );
    })
    .map((target) => ({ channel: target.channel, targetId: target.id }));
};

/**
 * Records a notification and sends it.
 *
 * The row is written before anything leaves the building, so "did the customer
 * actually get the notice?" has an answer - which is the first question asked
 * in any dispute about a suspension.
 *
 * Never throws. Every failure is recorded on its own row and retried by
 * `/api/cron/retry-notifications`; the caller is told what happened through
 * the returned counts and is free to ignore them.
 */
export const dispatchNotification = async (
  input: DispatchNotificationInput,
): Promise<DispatchResult> => {
  const empty: DispatchResult = {
    created: 0,
    deduplicated: 0,
    delivered: 0,
    skipped: 0,
    failed: 0,
  };

  let candidates: Candidate[];
  try {
    candidates = await resolveCandidates(input);
  } catch (error) {
    console.error("[notifications] Failed to resolve destinations", error);
    return empty;
  }

  if (0 === candidates.length) return empty;

  const userId = "user" === input.audience.kind ? input.audience.userId : null;

  const rows = await db
    .insert(notificationDeliveries)
    .values(
      candidates.map((candidate) => ({
        notificationKey: input.key,
        dedupeKey: derivedDedupeKey(input, candidate),
        audience: input.audience.kind,
        userId,
        targetId: candidate.targetId,
        channel: candidate.channel,
        severity: input.severity,
        groupKey: input.groupKey ?? null,
        params: input.params ?? {},
        url: input.url ?? null,
      })),
    )
    // The unique index on `dedupe_key` is what makes "tell them once" true
    // across instances; an in-process guard would not survive two serverless
    // invocations racing on the same case.
    .onConflictDoNothing({ target: notificationDeliveries.dedupeKey })
    .returning();

  const result: DispatchResult = {
    ...empty,
    created: rows.length,
    deduplicated: candidates.length - rows.length,
  };

  const outcomes = await Promise.all(rows.map(deliverNotification));
  for (const outcome of outcomes) result[outcome] += 1;

  return result;
};
