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
import * as z from "zod";
import type { ConfigSource } from "../config-source";
import { defineIntegration } from "../define-integration";
import type { LogSink } from "../logger";
import { HEALTH_PROBE_CONCURRENCY, IntegrationRegistry } from "../registry";
import type {
  IntegrationContext,
  IntegrationHealth,
  IntegrationLogger,
} from "../types";

const silentLogger: IntegrationLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const SECRET = "sk-live-0123456789";

const configFor = (enabled: Record<string, boolean>): ConfigSource => ({
  isEnabled: async (integration) => enabled[integration.id] ?? false,
  settings: async () => ({}),
  secrets: async () => ({ apiKey: SECRET }),
});

const integration = (
  id: string,
  hooks: {
    health?: (ctx: IntegrationContext) => Promise<IntegrationHealth>;
    healthBudgetMs?: number;
    onEnable?: (ctx: IntegrationContext) => Promise<void>;
    onDisable?: (ctx: IntegrationContext) => Promise<void>;
  } = {},
) =>
  defineIntegration({
    id,
    name: id,
    description: id,
    category: "platform",
    secrets: {
      schema: z.object({ apiKey: z.string() }),
      fields: [{ key: "apiKey", label: "API key", widget: "password" }],
    },
    provides: {},
    ...hooks,
  });

const ok = async (): Promise<IntegrationHealth> => ({
  status: "ok",
  checkedAt: new Date(),
});

describe("lifecycle hooks", () => {
  test("onDisable runs with the stored configuration while the integration reads as disabled (C3)", async () => {
    const seen: unknown[] = [];
    const registry = new IntegrationRegistry({
      integrations: [
        integration("alpha", {
          onDisable: async (ctx) => {
            seen.push(ctx.secrets);
          },
        }),
      ],
      config: configFor({ alpha: false }),
      logger: silentLogger,
    });

    await registry.runDisableHook("alpha");

    expect(seen).toEqual([{ apiKey: SECRET }]);
  });

  test("onEnable runs with the stored configuration while the flag reads as disabled", async () => {
    let ran = false;
    const registry = new IntegrationRegistry({
      integrations: [
        integration("alpha", {
          onEnable: async () => {
            ran = true;
          },
        }),
      ],
      config: configFor({}),
      logger: silentLogger,
    });

    await registry.runEnableHook("alpha");

    expect(ran).toBe(true);
  });
});

describe("lifecycle hook failures", () => {
  test("a hook's error message reaches the caller with the secrets redacted", async () => {
    const registry = new IntegrationRegistry({
      integrations: [
        integration("alpha", {
          onEnable: async () => {
            throw new Error(`rejected key ${SECRET}`);
          },
        }),
      ],
      config: configFor({}),
      logger: silentLogger,
    });

    await expect(registry.runEnableHook("alpha")).rejects.toThrow(
      "rejected key [redacted]",
    );
  });

  test("disabling an integration without onDisable reads no configuration, so a broken one still switches off", async () => {
    const registry = new IntegrationRegistry({
      integrations: [integration("alpha")],
      config: {
        isEnabled: async () => true,
        settings: async () => ({}),
        secrets: async () => ({ apiKey: 42 }),
      },
      logger: silentLogger,
    });

    await expect(registry.runDisableHook("alpha")).resolves.toBeUndefined();
  });
});

describe("health", () => {
  test("a probe's message reaches the caller with the secrets redacted", async () => {
    const registry = new IntegrationRegistry({
      integrations: [
        integration("alpha", {
          health: async () => {
            throw new Error(`bad key ${SECRET}`);
          },
        }),
        integration("beta", {
          health: async () => ({
            status: "degraded",
            checkedAt: new Date(),
            message: `quota low for ${SECRET}`,
          }),
        }),
      ],
      config: configFor({ alpha: true, beta: true }),
      logger: silentLogger,
    });

    expect(await registry.healthOf("alpha")).toMatchObject({
      message: "bad key [redacted]",
    });
    expect(await registry.healthOf("beta")).toMatchObject({
      message: "quota low for [redacted]",
    });
  });

  test("healthOf probes only the integration asked about (C4)", async () => {
    const probed: string[] = [];
    const probe = (id: string) => async () => {
      probed.push(id);
      return ok();
    };
    const registry = new IntegrationRegistry({
      integrations: [
        integration("alpha", { health: probe("alpha") }),
        integration("beta", { health: probe("beta") }),
      ],
      config: configFor({ alpha: true, beta: true }),
      logger: silentLogger,
    });

    expect((await registry.healthOf("alpha")).status).toBe("ok");
    expect(probed).toEqual(["alpha"]);
  });

  test("healthOf throws for an unknown integration", async () => {
    const registry = new IntegrationRegistry({
      integrations: [],
      config: configFor({}),
      logger: silentLogger,
    });

    await expect(registry.healthOf("missing")).rejects.toThrow(
      'Unknown integration "missing"',
    );
  });

  test("a probe that outlives its budget reports error", async () => {
    const registry = new IntegrationRegistry({
      integrations: [
        integration("slow", {
          health: () => new Promise(() => {}),
          healthBudgetMs: 20,
        }),
      ],
      config: configFor({ slow: true }),
      logger: silentLogger,
    });

    expect(await registry.healthOf("slow")).toMatchObject({
      status: "error",
      message: "The health probe did not answer within 20 ms",
    });
  });

  test("health runs at most HEALTH_PROBE_CONCURRENCY probes at once and reports each", async () => {
    let running = 0;
    let peak = 0;
    const probe = async () => {
      running++;
      peak = Math.max(peak, running);
      await Bun.sleep(5);
      running--;
      return ok();
    };
    const ids = ["a", "b", "c", "d", "e", "f"];
    const registry = new IntegrationRegistry({
      integrations: ids.map((id) => integration(id, { health: probe })),
      config: configFor(Object.fromEntries(ids.map((id) => [id, true]))),
      logger: silentLogger,
    });

    const health = await registry.health();

    expect(peak).toBe(HEALTH_PROBE_CONCURRENCY);
    expect(Object.keys(health).sort()).toEqual(ids);
  });
});

describe("the context", () => {
  test("its logger prefixes the integration and redacts its secrets", async () => {
    const lines: [string, Record<string, unknown>][] = [];
    const sink: LogSink = {
      debug: () => {},
      info: (message, fields) => lines.push([message, fields]),
      warn: () => {},
      error: () => {},
    };
    const registry = new IntegrationRegistry({
      integrations: [
        integration("alpha", {
          health: async (ctx) => {
            ctx.logger.info(`using ${SECRET}`, { key: SECRET });
            return ok();
          },
        }),
      ],
      config: configFor({ alpha: true }),
      logger: silentLogger,
      logSink: sink,
    });

    await registry.healthOf("alpha");

    expect(lines).toEqual([
      [
        "[integrations:alpha] using [redacted]",
        { integration: "alpha", key: "[redacted]" },
      ],
    ]);
  });

  test("its http reports every request, with secrets redacted from the URL", async () => {
    const urls: string[] = [];
    const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
    try {
      const registry = new IntegrationRegistry({
        integrations: [
          integration("alpha", {
            health: async (ctx) => {
              await ctx.http.request(
                `http://localhost:${server.port}/${SECRET}?token=${SECRET}`,
              );
              return ok();
            },
          }),
        ],
        config: configFor({ alpha: true }),
        logger: silentLogger,
        onHttpRequest: (event) => urls.push(event.url),
      });

      await registry.healthOf("alpha");

      expect(urls).toEqual([
        `http://localhost:${server.port}/[redacted]?[redacted]`,
      ]);
    } finally {
      await server.stop();
    }
  });
});
