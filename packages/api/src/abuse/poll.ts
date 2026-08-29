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
import { and, count, eq, isNull, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import {
  abuseSourceCursors,
  subnetAllocations,
  subnets,
} from "@virtbase/db/schema";
import type { AbuseSource } from "@virtbase/ports";
import { dispatchNotification } from "../notifications/dispatch";
import { isPublicIpv4, supernet } from "./cidr";
import { submitSignals } from "./intake";

type Database = typeof database;

/**
 * How many ranges one run will offer a source.
 *
 * A ceiling on the work, not on the provider's quota - the source knows its
 * own plan and clamps further. This is only how much the platform is prepared
 * to wait for inside one cron invocation.
 */
export const MAX_TARGETS_PER_RUN = 25;

/** The block size to roll our subnets up to. A free AbuseIPDB key allows /24. */
export const DEFAULT_BLOCK_PREFIX = 24;

/**
 * Provider calls the work ceiling allows per range offered.
 *
 * More than one, because a source may legitimately spend a second call on a
 * range - AbuseIPDB's category lookup is exactly that. Tying the ceiling to
 * one call per range would make every such feature unreachable rather than
 * merely expensive. The source's own setting is the authority on quota; this
 * only bounds how much work one cron invocation will wait for.
 */
const CALLS_PER_TARGET_ALLOWANCE = 2;

/** Nothing has been swept before the first run; start a month back. */
const INITIAL_WATERMARK_DAYS = 30;

export interface PollSourceResult {
  source: string;
  offered: number;
  covered: number;
  signals: number;
  cases: number;
  quotaRemaining: number | null;
  error: string | null;
}

interface Target {
  cidr: string;
  /** Servers inside the block, used to sweep the busiest ranges first. */
  servers: number;
  lastPolledAt: Date | null;
  watermark: Date | null;
}

/**
 * The ranges worth asking about, busiest and least recently swept first.
 *
 * Derived from live allocations rather than from the parent blocks: a /22 we
 * announce but have not populated is four provider calls that can only ever
 * return nothing.
 */
export const collectPollTargets = async ({
  db,
  source,
  blockPrefixLength = DEFAULT_BLOCK_PREFIX,
  limit = MAX_TARGETS_PER_RUN,
}: {
  db: Database;
  source: string;
  blockPrefixLength?: number;
  limit?: number;
}): Promise<Target[]> => {
  const allocated = await db
    .select({ cidr: subnets.cidr, servers: count() })
    .from(subnetAllocations)
    .innerJoin(subnets, eq(subnets.id, subnetAllocations.subnetId))
    .where(
      and(
        isNull(subnetAllocations.deallocatedAt),
        sql`family(${subnets.cidr}) = 4`,
      ),
    )
    .groupBy(subnets.cidr);

  const blocks = new Map<string, number>();
  for (const row of allocated) {
    if (!isPublicIpv4(row.cidr)) continue;

    const block = supernet(row.cidr, blockPrefixLength);
    if (!block) continue;

    blocks.set(block, (blocks.get(block) ?? 0) + row.servers);
  }

  if (0 === blocks.size) return [];

  const cursors = await db
    .select({
      target: abuseSourceCursors.target,
      lastPolledAt: abuseSourceCursors.lastPolledAt,
      watermark: abuseSourceCursors.watermark,
    })
    .from(abuseSourceCursors)
    .where(eq(abuseSourceCursors.source, source));

  const seen = new Map(cursors.map((cursor) => [cursor.target, cursor]));

  return [...blocks.entries()]
    .map(([cidr, servers]) => ({
      cidr,
      servers,
      lastPolledAt: seen.get(cidr)?.lastPolledAt ?? null,
      watermark: seen.get(cidr)?.watermark ?? null,
    }))
    .sort((a, b) => {
      // Never swept first: a range nobody has ever asked about is the one most
      // likely to be hiding something.
      if (!a.lastPolledAt && b.lastPolledAt) return -1;
      if (a.lastPolledAt && !b.lastPolledAt) return 1;

      if (a.lastPolledAt && b.lastPolledAt) {
        const byAge = a.lastPolledAt.getTime() - b.lastPolledAt.getTime();
        if (0 !== byAge) return byAge;
      }

      return b.servers - a.servers;
    })
    .slice(0, limit);
};

/**
 * Runs one sweep of every pull source.
 *
 * Cursors advance only for the ranges a source reports as covered. A run cut
 * short by a quota has not looked at the rest, and advancing their watermarks
 * would silently skip a window nothing ever looks at again.
 */
export const pollAbuseSources = async ({
  db,
  sources,
}: {
  db: Database;
  /** Injected in tests; resolved from the registry otherwise. */
  sources?: AbuseSource[];
}): Promise<PollSourceResult[]> => {
  const resolved =
    sources ??
    (await (await import("../integrations")).integrations.resolveAll("abuse"));

  const results: PollSourceResult[] = [];

  for (const source of resolved) {
    if (!source.poll) continue;

    const result: PollSourceResult = {
      source: source.id,
      offered: 0,
      covered: 0,
      signals: 0,
      cases: 0,
      quotaRemaining: null,
      error: null,
    };

    try {
      const targets = await collectPollTargets({ db, source: source.id });
      result.offered = targets.length;

      if (0 === targets.length) {
        results.push(result);
        continue;
      }

      // The oldest watermark in the slice, so a range swept for the first time
      // does not make the others miss a window.
      const since = targets.reduce<Date>((oldest, target) => {
        const candidate =
          target.watermark ??
          new Date(Date.now() - INITIAL_WATERMARK_DAYS * 86_400_000);
        return candidate < oldest ? candidate : oldest;
      }, new Date());

      const outcome = await source.poll({
        since,
        targets: targets.map(({ cidr }) => ({ cidr })),
        budget: targets.length * CALLS_PER_TARGET_ALLOWANCE,
      });

      result.covered = outcome.covered.length;
      result.quotaRemaining = outcome.quotaRemaining ?? null;

      if (outcome.signals.length > 0) {
        const ingested = await submitSignals({ db, signals: outcome.signals });
        result.signals = ingested.length;
        result.cases = new Set(
          ingested.flatMap((entry) => (entry.caseId ? [entry.caseId] : [])),
        ).size;
      }

      for (const cidr of outcome.covered) {
        await db
          .insert(abuseSourceCursors)
          .values({
            source: source.id,
            target: cidr,
            watermark: new Date(),
            lastPolledAt: new Date(),
            lastError: null,
          })
          .onConflictDoUpdate({
            target: [abuseSourceCursors.source, abuseSourceCursors.target],
            set: {
              watermark: sql`now()`,
              lastPolledAt: sql`now()`,
              lastError: null,
            },
          });
      }

      // Covering less than was offered means the source ran out of quota part
      // way through. Worth saying once, because the sweep is then only as wide
      // as the plan allows and nobody would otherwise notice.
      if (result.covered < result.offered) {
        await dispatchNotification({
          key: "abuse.source.poll_incomplete",
          audience: { kind: "operator" },
          severity: "warning",
          groupKey: `abuse-source:${source.id}:${new Date().toISOString().slice(0, 10)}`,
          params: {
            source: source.id,
            covered: result.covered,
            offered: result.offered,
            quotaRemaining: result.quotaRemaining,
          },
        }).catch(() => undefined);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      Sentry.captureException(error, {
        tags: { "abuse.poll": source.id },
      });

      await dispatchNotification({
        key: "abuse.source.poll_failed",
        audience: { kind: "operator" },
        severity: "warning",
        groupKey: `abuse-source:${source.id}:failed:${new Date().toISOString().slice(0, 10)}`,
        params: { source: source.id, error: result.error },
      }).catch(() => undefined);
    }

    results.push(result);
  }

  return results;
};
