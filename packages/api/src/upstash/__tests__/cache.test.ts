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

import { beforeEach, describe, expect, mock, test } from "bun:test";

const store = new Map<string, unknown>();
const calls = { get: 0, set: 0, del: 0 };
let getError: Error | null = null;
let setError: Error | null = null;

mock.module("../redis", () => ({
  redis: {
    get: async (key: string) => {
      calls.get++;
      if (getError) throw getError;
      return store.get(key) ?? null;
    },
    set: async (key: string, value: unknown) => {
      calls.set++;
      if (setError) throw setError;
      store.set(key, value);
    },
    del: async (key: string) => {
      calls.del++;
      store.delete(key);
    },
  },
}));

const { cached, invalidateCached } = await import("../cache");

beforeEach(() => {
  store.clear();
  calls.get = 0;
  calls.set = 0;
  calls.del = 0;
  getError = null;
  setError = null;
});

describe("cached", () => {
  test("it computes and stores on a miss, then serves the stored value", async () => {
    let produced = 0;
    const produce = async () => ({ value: ++produced });

    expect(await cached("k", 60, produce)).toEqual({ value: 1 });
    expect(await cached("k", 60, produce)).toEqual({ value: 1 });
    expect(produced).toBe(1);
    expect(calls.set).toBe(1);
  });

  test("it namespaces keys so they cannot collide with the ratelimiter", async () => {
    await cached("guest-agent:kvm_1", 60, async () => ({ ok: true }));

    expect([...store.keys()]).toEqual(["vb:cache:guest-agent:kvm_1"]);
  });

  test("it recomputes and writes back when refresh is set", async () => {
    let produced = 0;
    const produce = async () => ({ value: ++produced });

    await cached("k", 60, produce);
    const refreshed = await cached("k", 60, produce, { refresh: true });

    expect(refreshed).toEqual({ value: 2 });
    // The refreshed value is shared, not just returned to this caller.
    expect(await cached("k", 60, produce)).toEqual({ value: 2 });
  });

  test("it skips the read entirely when refreshing", async () => {
    await cached("k", 60, async () => ({ value: 1 }), { refresh: true });

    expect(calls.get).toBe(0);
  });

  test("it falls through to producing when Redis cannot be read", async () => {
    getError = new Error("upstash is down");

    expect(await cached("k", 60, async () => ({ value: 7 }))).toEqual({
      value: 7,
    });
  });

  test("it still returns a value when Redis cannot be written", async () => {
    setError = new Error("upstash is down");

    expect(await cached("k", 60, async () => ({ value: 7 }))).toEqual({
      value: 7,
    });
  });

  test("it caches a probe failure, so an unreachable agent is not re-probed", async () => {
    // Failures come back as values rather than exceptions precisely so they can
    // be cached - otherwise every page view retries a VM that is switched off.
    let produced = 0;
    const produce = async () => {
      produced++;
      return { status: "agent_unreachable" as const };
    };

    await cached("probe", 60, produce);
    await cached("probe", 60, produce);

    expect(produced).toBe(1);
  });
});

describe("invalidateCached", () => {
  test("it drops the stored value so the next read recomputes", async () => {
    let produced = 0;
    const produce = async () => ({ value: ++produced });

    await cached("k", 60, produce);
    await invalidateCached("k");

    expect(await cached("k", 60, produce)).toEqual({ value: 2 });
  });
});
