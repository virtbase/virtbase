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

import { beforeEach, describe, expect, test } from "bun:test";
import type { PlatformMetricsReader } from "@virtbase/ports";
import {
  collectPlatformMetrics,
  PLATFORM_GAUGE_SUFFIXES,
  toAgeSeconds,
} from "../collectors";
import { DEFAULT_DURATION_BUCKETS_MS } from "../manifest";
import { MetricsRuntime } from "../runtime";
import { createFakeReader, READ_AT, SNAPSHOT } from "./fake-core";

const errors: string[] = [];

const contextWith = (reader: PlatformMetricsReader | null) => ({
  reader: async () => {
    if (!reader) throw new Error("nothing provides platformMetrics");
    return reader;
  },
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => {
      errors.push(message);
    },
  },
});

let runtime: MetricsRuntime;

beforeEach(() => {
  errors.length = 0;
  runtime = new MetricsRuntime({
    prefix: "virtbase_",
    collectDefaultMetrics: false,
    durationBucketsMs: DEFAULT_DURATION_BUCKETS_MS,
  });
});

const scrape = () => runtime.registry.metrics();

describe("collectPlatformMetrics", () => {
  test("writes every gauge of the snapshot", async () => {
    expect(
      await collectPlatformMetrics(
        runtime,
        contextWith(createFakeReader(SNAPSHOT)),
      ),
    ).toBe(true);

    const text = await scrape();
    for (const line of [
      'virtbase_servers{state="active"} 5',
      'virtbase_servers{state="suspended"} 0',
      'virtbase_servers_per_node{node="pve1",datacenter="fsn"} 8',
      'virtbase_server_backups{state="running"} 1',
      "virtbase_server_backup_bytes 3072",
      "virtbase_server_backup_oldest_unsettled_seconds 90",
      'virtbase_orders{status="draft"} 0',
      "virtbase_order_oldest_in_flight_seconds 0",
      'virtbase_payments{status="refunded"} 1',
      'virtbase_payment_amount_minor_units{kind="captured",currency="EUR"} 5950',
      'virtbase_payment_amount_minor_units{kind="refunded",currency="EUR"} 1190',
      "virtbase_users 3",
      'virtbase_proxmox_nodes{datacenter="fsn"} 1',
      'virtbase_subnet_allocations{state="released"} 2',
      "virtbase_platform_collector_up 1",
    ]) {
      expect(text).toContain(line);
    }
  });

  test("writes a series for every entry of PLATFORM_GAUGE_SUFFIXES", async () => {
    await collectPlatformMetrics(
      runtime,
      contextWith(createFakeReader(SNAPSHOT)),
    );

    const text = await scrape();
    for (const suffix of PLATFORM_GAUGE_SUFFIXES) {
      expect(text).toContain(`# TYPE virtbase_${suffix} gauge`);
    }
  });

  test("drops a node that is gone from the next snapshot", async () => {
    const context = contextWith(
      createFakeReader(SNAPSHOT, { ...SNAPSHOT, serversPerNode: [] }),
    );

    await collectPlatformMetrics(runtime, context);
    await collectPlatformMetrics(runtime, context);

    expect(await scrape()).not.toContain("virtbase_servers_per_node{");
  });

  test("reports a failed read as collector_up 0, logs it, and does not throw", async () => {
    expect(
      await collectPlatformMetrics(runtime, contextWith(createFakeReader())),
    ).toBe(false);

    expect(await scrape()).toContain("virtbase_platform_collector_up 0");
    expect(errors).toEqual(["Failed to collect platform metrics"]);
  });

  test("keeps the last successful values when a read fails", async () => {
    await collectPlatformMetrics(
      runtime,
      contextWith(createFakeReader(SNAPSHOT)),
    );
    await collectPlatformMetrics(runtime, contextWith(createFakeReader()));

    const text = await scrape();
    expect(text).toContain("virtbase_platform_collector_up 0");
    expect(text).toContain('virtbase_servers{state="active"} 5');
    expect(text).toContain("virtbase_users 3");
  });

  test("fails while a platform gauge's name is registered with another label set", async () => {
    runtime.gauge({ name: "virtbase_servers", help: "Recorded elsewhere." });

    expect(
      await collectPlatformMetrics(
        runtime,
        contextWith(createFakeReader(SNAPSHOT)),
      ),
    ).toBe(false);
  });

  test("reports a missing platformMetrics provider the same way", async () => {
    expect(await collectPlatformMetrics(runtime, contextWith(null))).toBe(
      false,
    );
    expect(await scrape()).toContain("virtbase_platform_collector_up 0");
  });
});

describe("toAgeSeconds", () => {
  test("is zero when there is nothing to age", () => {
    expect(toAgeSeconds(null, READ_AT)).toBe(0);
  });

  test("is never negative for a timestamp after the read", () => {
    expect(toAgeSeconds(new Date(READ_AT.getTime() + 1_000), READ_AT)).toBe(0);
  });
});
