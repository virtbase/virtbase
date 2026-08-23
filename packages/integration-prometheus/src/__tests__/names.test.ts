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

import { describe, expect, test } from "bun:test";
import {
  projectLabels,
  toCounterName,
  toLabelName,
  toLabelNames,
  toMetricName,
} from "../names";

describe("toMetricName", () => {
  test("turns a dotted port name into a prefixed snake_case name", () => {
    expect(toMetricName("provisioning.duration", "virtbase_")).toBe(
      "virtbase_provisioning_duration",
    );
    expect(toMetricName("servers.provisioned", "vb_")).toBe(
      "vb_servers_provisioned",
    );
  });

  test("splits camelCase, including acronyms", () => {
    expect(toMetricName("server.planId", "virtbase_")).toBe(
      "virtbase_server_plan_id",
    );
    expect(toMetricName("api.HTTPStatus", "virtbase_")).toBe(
      "virtbase_api_http_status",
    );
  });

  test("replaces illegal characters and collapses the result", () => {
    expect(toMetricName("billing/invoice-sent!", "virtbase_")).toBe(
      "virtbase_billing_invoice_sent",
    );
    expect(toMetricName("..a..b..", "virtbase_")).toBe("virtbase_a_b");
  });

  test("keeps colons, which are legal in metric names", () => {
    expect(toMetricName("job:duration", "")).toBe("job:duration");
  });

  test("returns nothing when nothing legal survives", () => {
    expect(toMetricName("!!!", "virtbase_")).toBe("");
    expect(toMetricName("", "virtbase_")).toBe("");
  });

  test("keeps a name legal when the prefix is empty", () => {
    // A metric name may not start with a digit.
    expect(toMetricName("5xx.responses", "")).toBe("_5xx_responses");
  });
});

describe("toCounterName", () => {
  test("appends the conventional _total suffix", () => {
    expect(toCounterName("servers.provisioned", "virtbase_")).toBe(
      "virtbase_servers_provisioned_total",
    );
  });

  test("does not append it twice", () => {
    expect(toCounterName("servers.provisioned.total", "virtbase_")).toBe(
      "virtbase_servers_provisioned_total",
    );
  });

  test("passes an unusable name through as unusable", () => {
    expect(toCounterName("!!!", "virtbase_")).toBe("");
  });
});

describe("toLabelName", () => {
  test("snake_cases and strips illegal characters", () => {
    expect(toLabelName("planId")).toBe("plan_id");
    expect(toLabelName("data-center")).toBe("data_center");
  });

  test("strips the reserved leading underscores", () => {
    expect(toLabelName("__name__")).toBe("name");
  });

  test("rejects a colon, which is legal in a metric name but not a label", () => {
    expect(toLabelName("job:kind")).toBe("job_kind");
  });

  test("returns nothing when nothing legal survives", () => {
    expect(toLabelName("!!!")).toBe("");
  });
});

describe("toLabelNames", () => {
  test("sorts, so the created label set does not depend on key order", () => {
    expect(toLabelNames({ status: "ok", datacenter: "fsn1" })).toEqual([
      "datacenter",
      "status",
    ]);
  });

  test("drops keys that sanitise to nothing, and deduplicates", () => {
    expect(toLabelNames({ "!!": "x", planId: "a", plan_id: "b" })).toEqual([
      "plan_id",
    ]);
  });

  test("handles a sample with no labels", () => {
    expect(toLabelNames(undefined)).toEqual([]);
  });
});

describe("projectLabels", () => {
  test("fills every declared label, defaulting the absent ones", () => {
    expect(projectLabels({ status: "ok" }, ["status", "datacenter"])).toEqual({
      status: "ok",
      datacenter: "",
    });
  });

  test("drops a dimension the metric was not created with", () => {
    // prom-client throws on an undeclared label, which would cost the whole
    // sample rather than the one dimension.
    expect(projectLabels({ status: "ok", userId: "u_1" }, ["status"])).toEqual({
      status: "ok",
    });
  });

  test("matches on the sanitised name", () => {
    expect(projectLabels({ planId: "kvm-2" }, ["plan_id"])).toEqual({
      plan_id: "kvm-2",
    });
  });
});
