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

import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_DURATION_BUCKETS_MS } from "../manifest";
import { getRuntime, MetricsRuntime, resetRuntime } from "../runtime";

const OPTIONS = {
  prefix: "virtbase_",
  collectDefaultMetrics: false,
  durationBucketsMs: DEFAULT_DURATION_BUCKETS_MS,
};

afterEach(() => {
  resetRuntime();
});

describe("MetricsRuntime", () => {
  test("returns the same metric for a name registered once", () => {
    const runtime = new MetricsRuntime(OPTIONS);
    const spec = { name: "virtbase_up", help: "Up." };

    expect(runtime.gauge(spec)).toBe(runtime.gauge(spec));
  });

  test("returns null for a name registered as another kind", () => {
    const runtime = new MetricsRuntime(OPTIONS);
    const spec = { name: "virtbase_mixed", help: "Mixed." };
    runtime.counter(spec);

    expect(runtime.gauge(spec)).toBeNull();
    expect(runtime.histogram(spec)).toBeNull();
    expect(runtime.counter(spec)).not.toBeNull();
  });

  test("returns null for a name that collectDefaultMetrics registered", () => {
    const runtime = new MetricsRuntime({
      ...OPTIONS,
      collectDefaultMetrics: true,
    });
    const spec = {
      name: "virtbase_process_resident_memory_bytes",
      help: "x",
    };

    expect(runtime.gauge(spec)).toBeNull();
    expect(runtime.counter(spec)).toBeNull();
    expect(runtime.histogram(spec)).toBeNull();
  });

  test("tells a metric without labels from one that does not exist", () => {
    const runtime = new MetricsRuntime(OPTIONS);
    runtime.histogram({ name: "virtbase_duration", help: "Duration." });

    expect(runtime.labelNamesOf("virtbase_duration")).toEqual([]);
    expect(runtime.labelNamesOf("virtbase_missing")).toBeNull();
  });
});

describe("getRuntime", () => {
  test("keeps the runtime while the configuration is the same", () => {
    expect(getRuntime(OPTIONS)).toBe(getRuntime({ ...OPTIONS }));
  });

  test("replaces the runtime when the prefix changes", () => {
    const first = getRuntime(OPTIONS);

    expect(getRuntime({ ...OPTIONS, prefix: "other_" })).not.toBe(first);
  });
});
