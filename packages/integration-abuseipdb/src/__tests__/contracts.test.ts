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
  createIntegrationHttp,
  createRedactor,
  IntegrationRegistry,
} from "@virtbase/integration-sdk";
import { describeAbuseSource } from "@virtbase/integration-testing/ports/abuse";
import { describeIpReputationProvider } from "@virtbase/integration-testing/ports/ip-reputation";
import type { AbuseIpDbContext, AbuseIpDbSettings } from "../config";
import abuseipdb from "../index";
import { settingsSchema } from "../manifest";
import { AbuseIpDbReputation } from "../reputation";
import { AbuseIpDbSource } from "../source";
import { createFakeAbuseIpDb } from "./fake-abuseipdb";

const API_KEY = "abuseipdb-contract-key-0123456789";

const FINDINGS = {
  "10.0.0.0/24": [
    {
      ipAddress: "10.0.0.7",
      numReports: 3,
      mostRecentReport: "2026-10-10T00:00:00+00:00",
      abuseConfidenceScore: 80,
    },
  ],
  "10.0.1.0/24": [
    {
      ipAddress: "10.0.1.9",
      numReports: 5,
      mostRecentReport: "2026-10-09T00:00:00+00:00",
      abuseConfidenceScore: 95,
    },
  ],
};

const contextOn = (
  fake: ReturnType<typeof createFakeAbuseIpDb>,
  settings: Partial<AbuseIpDbSettings> = {},
): AbuseIpDbContext => ({
  id: "abuseipdb",
  settings: { ...settingsSchema.parse({}), callsPerRun: 50, ...settings },
  secrets: { apiKey: API_KEY },
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  http: createIntegrationHttp({
    integrationId: "abuseipdb",
    redactor: createRedactor([API_KEY]),
    fetch: fake.fetch,
  }),
  ports: {
    resolve: async () => null,
    require: async () => {
      throw new Error("AbuseIPDB consumes no ports");
    },
  },
  waitUntil: () => {},
});

describeAbuseSource("AbuseIPDB", async () => {
  const fake = createFakeAbuseIpDb(API_KEY, FINDINGS);
  return {
    source: new AbuseIpDbSource(contextOn(fake)),
    targets: [{ cidr: "10.0.0.0/24" }, { cidr: "10.0.1.0/24" }],
    calls: fake.calls,
  };
});

describeIpReputationProvider("AbuseIPDB", async () => ({
  provider: new AbuseIpDbReputation(
    contextOn(createFakeAbuseIpDb(API_KEY, FINDINGS)),
  ),
  reportedIp: "10.0.1.9",
}));

describe("AbuseIpDbReputation.report", () => {
  test("refuses while reporting is switched off", async () => {
    const reputation = new AbuseIpDbReputation(
      contextOn(createFakeAbuseIpDb(API_KEY)),
    );

    await expect(
      reputation.report({
        ip: "10.0.1.9",
        categories: ["spam"],
        comment: "spam",
      }),
    ).rejects.toMatchObject({ code: "abuseipdb.reporting_disabled" });
  });

  test("refuses a category AbuseIPDB has no code for", async () => {
    const reputation = new AbuseIpDbReputation(
      contextOn(createFakeAbuseIpDb(API_KEY), { allowReporting: true }),
    );

    await expect(
      reputation.report({
        ip: "10.0.1.9",
        categories: ["nonsense"],
        comment: "x",
      }),
    ).rejects.toMatchObject({ code: "abuseipdb.no_matching_category" });
  });

  test("publishes a report with the mapped categories", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);
    const reputation = new AbuseIpDbReputation(
      contextOn(fake, { allowReporting: true }),
    );

    const result = await reputation.report({
      ip: "10.0.1.9",
      categories: ["spam"],
      comment: "Outbound spam, confirmed",
    });

    expect(result).toEqual({ externalId: "10.0.1.9" });
    expect(fake.reports).toEqual([
      { ip: "10.0.1.9", categories: "11", comment: "Outbound spam, confirmed" },
    ]);
  });
});

describe("AbuseIpDbReputation.report comment", () => {
  test("cuts the published comment to 1024 characters", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);
    const reputation = new AbuseIpDbReputation(
      contextOn(fake, { allowReporting: true }),
    );

    await reputation.report({
      ip: "10.0.1.9",
      categories: ["spam"],
      comment: "x".repeat(2000),
    });

    expect(fake.reports[0]?.comment).toHaveLength(1024);
  });
});

describe("resolving AbuseIPDB", () => {
  test("provides the abuse and ipReputation ports from the stored configuration", async () => {
    const registry = new IntegrationRegistry({
      integrations: [abuseipdb],
      config: {
        isEnabled: async () => true,
        settings: async () => ({}),
        secrets: async () => ({ apiKey: API_KEY }),
      },
      fetch: createFakeAbuseIpDb(API_KEY).fetch,
    });

    expect((await registry.resolve("abuse"))?.id).toBe("abuseipdb");
    expect((await registry.resolve("ipReputation"))?.id).toBe("abuseipdb");
  });
});

describe("enabling AbuseIPDB", () => {
  const registryOn = (apiKey: string) =>
    new IntegrationRegistry({
      integrations: [abuseipdb],
      config: {
        isEnabled: async () => false,
        settings: async () => ({}),
        secrets: async () => ({ apiKey }),
      },
      fetch: createFakeAbuseIpDb(API_KEY).fetch,
    });

  test("checks the key once and accepts a working one", async () => {
    await expect(
      registryOn(API_KEY).runEnableHook("abuseipdb"),
    ).resolves.toBeUndefined();
  });

  test("reports a rejected key", async () => {
    await expect(
      registryOn("wrong-key-0123456789abcdef").runEnableHook("abuseipdb"),
    ).rejects.toThrow("GET /check answered 401");
  });
});
