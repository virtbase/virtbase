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
import { IntegrationRegistry } from "@virtbase/integration-sdk";
import prometheus from "../index";
import { resetRuntime } from "../runtime";
import { createFakeReader, fakeCore, SNAPSHOT } from "./fake-core";

const TOKEN = "prometheus-scrape-token-0123456789";
const silent = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const registryWith = (
  settings: Record<string, unknown> = {},
  reader = createFakeReader(SNAPSHOT),
) => ({
  reader,
  registry: new IntegrationRegistry({
    integrations: [prometheus, fakeCore(reader)],
    config: {
      isEnabled: async () => true,
      settings: async () => ({ collectDefaultMetrics: false, ...settings }),
      secrets: async () => ({ scrapeToken: TOKEN }),
    },
    logger: silent,
    logSink: silent,
  }),
});

const scrape = async (
  registry: IntegrationRegistry,
  authorization?: string,
) => {
  const resolved = await registry.resolveWebhook(
    "prometheus",
    "metrics",
    "GET",
  );
  if (!resolved) throw new Error("the scrape endpoint is not mounted");
  return resolved.webhook.handler(
    new Request("https://virtbase.test/api/integrations/prometheus/metrics", {
      headers: authorization ? { authorization } : {},
    }),
    resolved.context,
  );
};

afterEach(() => {
  resetRuntime();
});

describe("the scrape endpoint", () => {
  test("serves the platform gauges to the bearer of the token, uncached", async () => {
    const { registry } = registryWith();

    const response = await scrape(registry, `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.text()).toContain(
      'virtbase_servers{state="active"} 5',
    );
  });

  test("answers 404 without a token, with another scheme and with a wrong token", async () => {
    const { registry, reader } = registryWith();

    for (const authorization of [
      undefined,
      `Basic ${TOKEN}`,
      "Bearer prometheus-wrong-token-0123456789",
    ]) {
      expect((await scrape(registry, authorization)).status).toBe(404);
    }
    expect(reader.reads()).toBe(0);
  });

  test("reads nothing from core while platform metrics are off", async () => {
    const { registry, reader } = registryWith({
      collectPlatformMetrics: false,
    });

    const response = await scrape(registry, `Bearer ${TOKEN}`);

    expect(await response.text()).not.toContain("virtbase_servers");
    expect(reader.reads()).toBe(0);
  });
});

describe("health", () => {
  test("is degraded when core cannot read the platform", async () => {
    const { registry } = registryWith({}, createFakeReader());

    expect((await registry.healthOf("prometheus")).status).toBe("degraded");
  });
});
