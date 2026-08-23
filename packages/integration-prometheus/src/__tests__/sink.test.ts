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
import type { IntegrationLogger } from "@virtbase/integration-sdk";
import { DEFAULT_DURATION_BUCKETS_MS } from "../config";
import { MetricsRuntime } from "../runtime";
import { PrometheusMetricsSink } from "../sink";

const warnings: string[] = [];

const logger: IntegrationLogger = {
  debug: () => {},
  info: () => {},
  warn: (message) => {
    warnings.push(message);
  },
  error: () => {},
};

let runtime: MetricsRuntime;
let sink: PrometheusMetricsSink;

beforeEach(() => {
  warnings.length = 0;
  runtime = new MetricsRuntime({
    prefix: "virtbase_",
    collectDefaultMetrics: false,
    durationBucketsMs: DEFAULT_DURATION_BUCKETS_MS,
  });
  sink = new PrometheusMetricsSink(runtime, logger);
});

const scrape = () => runtime.registry.metrics();

describe("increment", () => {
  test("exposes a counter under the sanitised, suffixed name", async () => {
    sink.increment({ name: "servers.provisioned" });
    sink.increment({ name: "servers.provisioned" }, 2);

    expect(await scrape()).toContain("virtbase_servers_provisioned_total 3");
  });

  test("keeps labels as dimensions", async () => {
    sink.increment({
      name: "servers.provisioned",
      labels: { datacenter: "fsn1" },
    });

    expect(await scrape()).toContain(
      'virtbase_servers_provisioned_total{datacenter="fsn1"} 1',
    );
  });
});

describe("gauge", () => {
  test("records a point-in-time value", async () => {
    sink.gauge({ name: "servers.running" }, 12);
    sink.gauge({ name: "servers.running" }, 9);

    expect(await scrape()).toContain("virtbase_servers_running 9");
  });
});

describe("observe", () => {
  test("records a distribution with the configured buckets", async () => {
    sink.observe({ name: "provisioning.duration" }, 120);

    const body = await scrape();
    expect(body).toContain("virtbase_provisioning_duration_count 1");
    expect(body).toContain("virtbase_provisioning_duration_sum 120");
    expect(body).toContain('virtbase_provisioning_duration_bucket{le="250"} 1');
    expect(body).toContain('virtbase_provisioning_duration_bucket{le="100"} 0');
  });
});

describe("recording never throws", () => {
  test("drops a sample whose name sanitises to nothing", async () => {
    expect(() => sink.increment({ name: "!!!" })).not.toThrow();

    expect((await scrape()).trim()).toBe("");
    expect(warnings.join()).toContain("no valid Prometheus metric name");
  });

  test("drops a non-finite value", async () => {
    sink.gauge({ name: "servers.running" }, Number.NaN);
    sink.gauge({ name: "cache.ratio" }, Number.POSITIVE_INFINITY);

    expect((await scrape()).trim()).toBe("");
    expect(warnings.join()).toContain("non-finite value");
  });

  test("drops a name already recorded as a different metric type", async () => {
    sink.increment({ name: "servers.provisioned" });
    // A counter and a gauge cannot share a name; prom-client would throw on the
    // second registration.
    expect(() =>
      sink.gauge({ name: "servers.provisioned.total" }, 5),
    ).not.toThrow();

    expect(await scrape()).toContain("virtbase_servers_provisioned_total 1");
    expect(warnings.join()).toContain(
      "already recorded as a different metric type",
    );
  });

  test("keeps a later sample when it carries an undeclared dimension", async () => {
    sink.increment({ name: "orders.paid", labels: { currency: "EUR" } });
    // `provider` was not present when the counter was created, so its label set
    // no longer accepts it. The sample still has to land.
    sink.increment({
      name: "orders.paid",
      labels: { currency: "EUR", provider: "stripe" },
    });

    expect(await scrape()).toContain(
      'virtbase_orders_paid_total{currency="EUR"} 2',
    );
  });

  test("records under the empty label when a later sample omits a dimension", async () => {
    sink.increment({ name: "orders.paid", labels: { currency: "EUR" } });
    sink.increment({ name: "orders.paid" });

    const body = await scrape();
    expect(body).toContain('virtbase_orders_paid_total{currency="EUR"} 1');
    expect(body).toContain('virtbase_orders_paid_total{currency=""} 1');
  });

  test("accepts labels on a metric that was created without any", async () => {
    sink.gauge({ name: "servers.running" }, 3);
    expect(() =>
      sink.gauge(
        { name: "servers.running", labels: { datacenter: "fsn1" } },
        4,
      ),
    ).not.toThrow();

    expect(await scrape()).toContain("virtbase_servers_running 4");
  });
});
