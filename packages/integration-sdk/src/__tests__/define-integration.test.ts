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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { defineIntegration } from "../define-integration";
import { defineManifest } from "../manifest";
import { IntegrationRegistry } from "../registry";
import { acmeConfig, acmeManifest, fakeDns, silentLogger } from "./acme";

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async () => {
      await Bun.sleep(1_000);
      return new Response("late");
    },
  });
});

afterAll(async () => {
  await server.stop(true);
});

const registryOf = (integration: ReturnType<typeof defineIntegration>) =>
  new IntegrationRegistry({
    integrations: [integration],
    config: acmeConfig,
    logger: silentLogger,
  });

describe("defineIntegration(manifest, runtime)", () => {
  test("serves its port with the parsed settings", async () => {
    const zones: string[] = [];
    const acme = defineIntegration(acmeManifest, {
      provides: {
        dns: (ctx) => ({
          ...fakeDns,
          upsertPointerRecord: async () => {
            zones.push(ctx.settings.zone);
          },
        }),
      },
      localize: async () => ({}),
    });

    const dns = await registryOf(acme).require("dns");
    await dns.upsertPointerRecord({
      ip: "10.0.0.1",
      hostname: "a.example",
      zone: "10.in-addr.arpa",
    });

    expect(zones).toEqual(["10.in-addr.arpa"]);
  });

  test("describes itself from the manifest's identity and links", async () => {
    const acme = defineIntegration(acmeManifest, {
      provides: { dns: () => fakeDns },
      localize: async () => ({}),
    });

    const [description] = await registryOf(acme).describeAll();

    expect(description).toMatchObject({
      id: "acme-dns",
      name: "Acme DNS",
      category: "infrastructure",
      website: "https://acme.example",
      docsUrl: "https://acme.example/docs",
    });
  });

  test("probes health within the runtime's budget", async () => {
    const acme = defineIntegration(acmeManifest, {
      provides: { dns: () => fakeDns },
      health: { budgetMs: 10, check: () => new Promise(() => {}) },
      localize: async () => ({}),
    });

    expect(await registryOf(acme).healthOf("acme-dns")).toMatchObject({
      status: "error",
      message: "The health probe did not answer within 10 ms",
    });
  });

  test("runs the runtime's lifecycle hooks with the parsed settings", async () => {
    const events: string[] = [];
    const acme = defineIntegration(acmeManifest, {
      provides: { dns: () => fakeDns },
      lifecycle: {
        onEnable: async (ctx) => {
          events.push(`enable ${ctx.settings.zone}`);
        },
        onDisable: async () => {
          events.push("disable");
        },
      },
      localize: async () => ({}),
    });
    const registry = registryOf(acme);

    await registry.runEnableHook("acme-dns");
    await registry.runDisableHook("acme-dns");

    expect(events).toEqual(["enable 10.in-addr.arpa", "disable"]);
  });

  test("gives ctx.http the manifest's timeout", async () => {
    let message = "";
    const acme = defineIntegration(acmeManifest, {
      provides: { dns: () => fakeDns },
      health: {
        check: async (ctx) => {
          await ctx.http
            .request(`http://localhost:${server.port}/`, { retries: 0 })
            .catch((error: unknown) => {
              message = error instanceof Error ? error.message : String(error);
            });
          return { status: "ok", checkedAt: new Date() };
        },
      },
      localize: async () => ({}),
    });

    await registryOf(acme).healthOf("acme-dns");

    expect(message).toBe(
      `GET http://localhost:${server.port}/ got no response within 20 ms`,
    );
  });

  test("keeps the manifest on the definition", () => {
    const acme = defineIntegration(acmeManifest, {
      provides: { dns: () => fakeDns },
      localize: async () => ({}),
    });

    expect(acme.manifest).toBe(acmeManifest);
  });
});

describe("the types hold the runtime to the manifest", () => {
  test("a runtime without a listed port's factory does not compile", () => {
    defineIntegration(acmeManifest, {
      // @ts-expect-error: the manifest provides dns, so its factory is required
      provides: {},
      localize: async () => ({}),
    });
    expect(true).toBe(true);
  });

  test("a factory for a port the manifest does not list does not compile", () => {
    defineIntegration(acmeManifest, {
      provides: {
        dns: () => fakeDns,
        // @ts-expect-error: the manifest does not provide invoice
        invoice: () => ({}),
      },
      localize: async () => ({}),
    });
    expect(true).toBe(true);
  });

  test("reading a setting the schema does not declare does not compile", () => {
    defineIntegration(acmeManifest, {
      provides: {
        dns: (ctx) => {
          // @ts-expect-error: the settings schema declares no apiUrl
          void ctx.settings.apiUrl;
          return fakeDns;
        },
      },
      localize: async () => ({}),
    });
    expect(true).toBe(true);
  });

  test("reading settings or secrets of a manifest that declares none does not compile", () => {
    const bare = defineManifest({
      apiVersion: 2,
      id: "bare",
      version: "1.0.0",
      name: "Bare",
      description: "No configuration.",
      category: "platform",
      docs: "./docs",
    });
    defineIntegration(bare, {
      provides: {},
      health: {
        check: async (ctx) => {
          // @ts-expect-error: the manifest declares no settings
          void ctx.settings.apiUrl;
          // @ts-expect-error: the manifest declares no secrets
          void ctx.secrets.token;
          return { status: "ok", checkedAt: new Date() };
        },
      },
      localize: async () => ({}),
    });
    expect(true).toBe(true);
  });
});
