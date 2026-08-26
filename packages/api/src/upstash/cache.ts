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
import { redis } from "./redis";

/** Namespace, so cache keys cannot collide with the ratelimiter's. */
const PREFIX = "vb:cache:";

export interface CachedOptions {
  /**
   * Ignore any stored value and recompute. The fresh value is still written
   * back, so an explicit "Check now" also refreshes what everyone else sees.
   */
  refresh?: boolean;
}

/**
 * Reads a value from Redis, computing and storing it on a miss.
 *
 * Built for probes that reach into a customer's VM: those cost a round trip to
 * a Proxmox node and a command inside the guest, while the page that shows them
 * refetches on every focus. Without a cache, one open browser tab turns into
 * steady load on somebody's server.
 *
 * Redis is treated as an optimisation, never a dependency - if it is
 * unreachable or returns junk, the value is computed as if it had been a miss.
 * `produce` therefore has to be safe to run more often than the TTL suggests.
 *
 * A stored `null` is indistinguishable from a miss, so cache objects rather
 * than nullable scalars.
 *
 * @param key - Unique per subject, e.g. `guest-agent:kvm_123`.
 * @param ttlSeconds - How long a computed value stays fresh.
 */
export const cached = async <T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
  { refresh = false }: CachedOptions = {},
): Promise<T> => {
  const namespaced = `${PREFIX}${key}`;

  if (!refresh) {
    try {
      const hit = await redis.get<T>(namespaced);

      if (hit !== null && hit !== undefined) {
        return hit;
      }
    } catch (error) {
      // A cache that cannot be read is a slow cache, not a broken feature.
      Sentry.captureException(error);
    }
  }

  const value = await produce();

  try {
    await redis.set(namespaced, value, { ex: ttlSeconds });
  } catch (error) {
    Sentry.captureException(error);
  }

  return value;
};

/**
 * Drops a cached value, so the next read recomputes it.
 *
 * Use after a mutation that invalidates a probe - changing a firewall rule
 * should not leave the previous analysis on screen for another minute.
 */
export const invalidateCached = async (key: string): Promise<void> => {
  try {
    await redis.del(`${PREFIX}${key}`);
  } catch (error) {
    Sentry.captureException(error);
  }
};

/**
 * Claims a key, returning whether the caller is the one that got it.
 *
 * The rate limiter for work that has no result worth caching - probing a
 * customer's server for its operating system, say, where the answer goes to
 * Postgres rather than to Redis. `SET NX EX` makes the claim atomic, so
 * several tabs polling the same server at once produce one probe between them
 * rather than one each.
 *
 * Fails **open**: an unreachable Redis returns `true` and the work runs. That
 * is the opposite choice from {@link cached}, and deliberate - a guard that
 * fails closed would silently stop detection entirely rather than merely stop
 * throttling it.
 *
 * @param key - Unique per subject, e.g. `guest-os:kvm_123`.
 * @param ttlSeconds - How long the claim is held before anyone may claim again.
 */
export const once = async (
  key: string,
  ttlSeconds: number,
): Promise<boolean> => {
  try {
    const claimed = await redis.set(`${PREFIX}${key}`, Date.now(), {
      nx: true,
      ex: ttlSeconds,
    });

    return claimed === "OK";
  } catch (error) {
    Sentry.captureException(error);

    return true;
  }
};
