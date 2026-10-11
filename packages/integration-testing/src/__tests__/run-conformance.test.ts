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
import { resolve } from "node:path";
import type { IntegrationHealth } from "@virtbase/integration-sdk";
import { defineIntegration } from "@virtbase/integration-sdk";
import { getExtracted } from "next-intl/server";
import type { ConformanceOptions } from "../describe-integration";
import { runConformance } from "../describe-integration";
import { example, exampleManifest, noopDns } from "./example/integration";

const SECRET = "example-secret-key";

const options: ConformanceOptions = {
  packageDir: resolve(import.meta.dir, "example"),
  config: {
    settings: { apiUrl: "https://provider.example", mode: "test" },
    secrets: { apiKey: SECRET },
  },
  backend: async () => new Response("ok"),
};

const translate = async () => {
  const t = await getExtracted("example-integration");
  return {
    name: t("Example"),
    description: t("Exercises the conformance suite."),
    fields: {
      apiUrl: { label: t("API URL") },
      mode: { label: t("Mode") },
      apiKey: { label: t("API key") },
    },
  };
};

const ok = (): IntegrationHealth => ({ status: "ok", checkedAt: new Date() });

const failedTitles = async (
  definition: Parameters<typeof runConformance>[0],
  overrides: Partial<ConformanceOptions> = {},
) =>
  (await runConformance(definition, { ...options, ...overrides })).map(
    (failure) => failure.slice(0, failure.indexOf(":")),
  );

describe("runConformance", () => {
  test("passes the conforming example", async () => {
    expect(await runConformance(example, options)).toEqual([]);
  });

  test("fails a v1 definition", async () => {
    const v1 = defineIntegration({
      id: "legacy",
      name: "Legacy",
      description: "A v1 definition.",
      category: "platform",
      provides: {},
      localize: translate,
    });

    expect(await failedTitles(v1)).toContain(
      "it is declared with a manifest that parses, supports this SDK and composes",
    );
  });

  test("fails text returned without the translator, and the root namespace", async () => {
    const literal = defineIntegration(exampleManifest, {
      provides: { dns: () => noopDns },
      localize: async () => {
        await getExtracted();
        return { name: "Example", fields: {} };
      },
    });

    expect(await failedTitles(literal)).toContain(
      "localize() translates the name, the description and every field label through its namespace",
    );
  });

  test("fails a probe that reports ok when the provider fails", async () => {
    const swallowing = defineIntegration(exampleManifest, {
      provides: { dns: () => noopDns },
      health: {
        check: async (ctx) => {
          await ctx.http
            .request(`${ctx.settings.apiUrl}/status`)
            .catch(() => null);
          return ok();
        },
      },
      localize: translate,
    });

    expect(await failedTitles(swallowing)).toEqual([
      "health reports error when the provider fails",
      "health reports error when the provider stops answering",
    ]);
  });

  test("fails an integration with a probe but no backend", async () => {
    expect(await failedTitles(example, { backend: undefined })).toEqual([
      "health reports ok against a working provider",
    ]);
  });

  test("passes a probe that reaches no provider, with the port it consumes composed alongside", async () => {
    const coreStub = defineIntegration({
      id: "core-stub",
      name: "Core",
      description: "Provides the ports the example consumes.",
      category: "platform",
      internal: true,
      provides: {
        ipReputation: () => ({
          id: "core-stub",
          check: async (ip) => ({
            ip,
            score: 0,
            categories: [],
            totalReports: 0,
            lastReportedAt: null,
          }),
        }),
      },
    });
    const local = defineIntegration(exampleManifest, {
      provides: { dns: () => noopDns },
      health: {
        check: async (ctx) => {
          await (await ctx.ports.require("ipReputation")).check("192.0.2.1");
          return ok();
        },
      },
      localize: translate,
    });

    expect(
      await failedTitles(local, {
        backend: undefined,
        healthReachesProvider: false,
        alongside: [coreStub],
      }),
    ).toEqual([]);
  });

  test("fails a probe declared local that reaches its provider", async () => {
    expect(
      await failedTitles(example, { healthReachesProvider: false }),
    ).toEqual(["health reports ok while every outbound request fails"]);
  });

  test("fails a packageDir without a package.json", async () => {
    expect(
      await failedTitles(example, {
        packageDir: resolve(import.meta.dir, "example/docs"),
      }),
    ).toEqual(["docs/ holds the nine files, each written"]);
  });

  test("fails a secret value in the translations", async () => {
    const leaking = defineIntegration(exampleManifest, {
      provides: { dns: () => noopDns },
      localize: async () => ({
        ...(await translate()),
        description: (await getExtracted("example-integration"))(
          `Key ${SECRET}`,
        ),
      }),
    });

    expect(await failedTitles(leaking)).toEqual([
      "no secret value reaches the description, health output or translations",
    ]);
  });
});
