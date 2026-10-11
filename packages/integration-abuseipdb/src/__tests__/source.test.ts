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
import type { IntegrationLogger } from "@virtbase/integration-sdk";
import {
  createIntegrationHttp,
  createRedactor,
  IntegrationError,
} from "@virtbase/integration-sdk";
import { dominantCategory } from "../categories";
import type {
  AbuseIpDbCheck,
  AbuseIpDbCheckBlock,
  AbuseIpDbClient,
} from "../client";
import { createAbuseIpDbClient, QUOTA_EXHAUSTED } from "../client";
import type { AbuseIpDbContext, AbuseIpDbSettings } from "../config";
import { AbuseIpDbSource } from "../source";
import { createFakeAbuseIpDb } from "./fake-abuseipdb";

const settings = (overrides: Partial<AbuseIpDbSettings> = {}) =>
  ({
    confidenceThreshold: 50,
    maxAgeInDays: 30,
    blockPrefixLength: 24,
    callsPerRun: 10,
    enrichCategories: false,
    allowReporting: false,
    ...overrides,
  }) satisfies AbuseIpDbSettings;

const SILENT: IntegrationLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const context = (
  overrides: Partial<AbuseIpDbSettings> = {},
  logger: IntegrationLogger = SILENT,
): AbuseIpDbContext => ({
  id: "abuseipdb",
  settings: settings(overrides),
  secrets: { apiKey: "k".repeat(20) },
  logger,
  ports: {
    resolve: async () => null,
    require: async () => {
      throw new Error("not used");
    },
  },
  http: createIntegrationHttp({
    integrationId: "abuseipdb",
    redactor: createRedactor([]),
    fetch: async () => {
      throw new Error("the fake client makes no requests");
    },
  }),
  waitUntil: () => undefined,
});

const reported = (
  ip: string,
  score: number,
  mostRecentReport: string | null = "2026-08-28T10:00:00+00:00",
) => ({
  ipAddress: ip,
  numReports: 4,
  mostRecentReport,
  abuseConfidenceScore: score,
  countryCode: "DE",
});

const unavailable = () =>
  new IntegrationError({
    code: "abuseipdb.request_failed",
    message: "GET /check-block answered 503",
    retryable: true,
    params: { status: 503 },
  });

interface FakeClientOptions {
  blocks?: Record<string, ReturnType<typeof reported>[]>;
  /** The number of block calls answered before every further one raises the daily-quota error. */
  exhaustedAfter?: number;
  /** Blocks whose call fails with a retryable error. */
  failing?: string[];
  /** Addresses whose lookup fails with `checkFailure`. */
  failingChecks?: string[];
  checkFailure?: Error;
  checks?: Record<string, Partial<AbuseIpDbCheck>>;
}

const createClient = (options: FakeClientOptions = {}) => {
  const calls: string[] = [];

  const client: AbuseIpDbClient = {
    quotaRemaining: 42,
    async checkBlock(network): Promise<AbuseIpDbCheckBlock> {
      calls.push(`block:${network}`);

      if (
        undefined !== options.exhaustedAfter &&
        calls.filter((call) => call.startsWith("block:")).length >
          options.exhaustedAfter
      ) {
        throw new IntegrationError({
          code: QUOTA_EXHAUSTED,
          message: "AbuseIPDB daily quota exhausted",
        });
      }
      if (options.failing?.includes(network)) throw unavailable();

      return {
        networkAddress: network.split("/")[0] ?? network,
        reportedAddress: options.blocks?.[network] ?? [],
      };
    },
    async check(ip): Promise<AbuseIpDbCheck> {
      calls.push(`check:${ip}`);
      if (options.failingChecks?.includes(ip)) {
        throw options.checkFailure ?? unavailable();
      }
      const answer: AbuseIpDbCheck = {
        ipAddress: ip,
        abuseConfidenceScore: 90,
        totalReports: 4,
        reports: [{ categories: [14] }],
      };
      return { ...answer, ...options.checks?.[ip] };
    },
    async report() {
      return { ipAddress: "" };
    },
  };

  return { client, calls };
};

const poll = (
  options: FakeClientOptions,
  request: { targets: string[]; budget?: number },
  overrides: Partial<AbuseIpDbSettings> = {},
) => {
  const { client, calls } = createClient(options);
  const warnings: { message: string; fields?: Record<string, unknown> }[] = [];
  const logger: IntegrationLogger = {
    ...SILENT,
    warn: (message, fields) => {
      warnings.push({ message, ...(fields ? { fields } : {}) });
    },
  };
  const source = new AbuseIpDbSource(context(overrides, logger), client);

  return source
    .poll({
      since: new Date("2026-08-01T00:00:00Z"),
      targets: request.targets.map((cidr) => ({ cidr })),
      // What the platform offers: a range may cost more than one call.
      budget: request.budget ?? request.targets.length * 2,
    })
    .then((result) => ({ result, calls, warnings }));
};

describe("AbuseIpDbSource", () => {
  test("turns reported addresses into signals", async () => {
    const { result } = await poll(
      { blocks: { "198.51.100.0/24": [reported("198.51.100.7", 88)] } },
      { targets: ["198.51.100.0/24"] },
    );

    expect(result.covered).toEqual(["198.51.100.0/24"]);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({
      source: "abuseipdb",
      externalId: "198.51.100.7:2026-08-28T10:00:00+00:00",
      type: "abuse.other",
      severity: "warning",
      subject: { kind: "ip", value: "198.51.100.7" },
      confidence: 88,
    });
    expect(result.quotaRemaining).toBe(42);
  });

  test("ignores addresses below the confidence threshold", async () => {
    const { result } = await poll(
      {
        blocks: {
          "198.51.100.0/24": [
            reported("198.51.100.7", 20),
            reported("198.51.100.8", 75),
          ],
        },
      },
      { targets: ["198.51.100.0/24"] },
      { confidenceThreshold: 50 },
    );

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.subject).toEqual({
      kind: "ip",
      value: "198.51.100.8",
    });
  });

  test("ignores an address with no report date", async () => {
    // Without one there is nothing to attribute against: the whole pipeline
    // resolves the address as it stood when the abuse happened.
    const { result } = await poll(
      { blocks: { "198.51.100.0/24": [reported("198.51.100.7", 90, null)] } },
      { targets: ["198.51.100.0/24"] },
    );

    expect(result.signals).toHaveLength(0);
  });

  test("severity follows the confidence score", async () => {
    const { result } = await poll(
      {
        blocks: {
          "198.51.100.0/24": [
            reported("198.51.100.1", 95),
            reported("198.51.100.2", 70),
            reported("198.51.100.3", 55),
          ],
        },
      },
      { targets: ["198.51.100.0/24"] },
      { confidenceThreshold: 50 },
    );

    expect(result.signals.map((signal) => signal.severity)).toEqual([
      "critical",
      "warning",
      "info",
    ]);
  });

  test("clamps the platform's offer to what the key can afford", async () => {
    const { result, calls } = await poll(
      {},
      { targets: ["1.0.0.0/24", "2.0.0.0/24", "3.0.0.0/24"] },
      { callsPerRun: 2 },
    );

    // The platform said three; the plan allows two.
    expect(calls.filter((call) => call.startsWith("block:"))).toHaveLength(2);
    expect(result.covered).toHaveLength(2);
  });

  test("stops on the daily quota and reports only what it covered", async () => {
    const { result } = await poll(
      {
        exhaustedAfter: 1,
        blocks: { "1.0.0.0/24": [reported("1.0.0.5", 90)] },
      },
      { targets: ["1.0.0.0/24", "2.0.0.0/24", "3.0.0.0/24"] },
    );

    // The findings from before the quota ran out are kept...
    expect(result.signals).toHaveLength(1);
    // ...and only the range actually swept advances its watermark. The rest
    // keep theirs and go first on the next run.
    expect(result.covered).toEqual(["1.0.0.0/24"]);
  });

  test("one unreachable range does not lose the rest of the sweep", async () => {
    const { result } = await poll(
      {
        failing: ["2.0.0.0/24"],
        blocks: {
          "1.0.0.0/24": [reported("1.0.0.5", 90)],
          "3.0.0.0/24": [reported("3.0.0.5", 90)],
        },
      },
      { targets: ["1.0.0.0/24", "2.0.0.0/24", "3.0.0.0/24"] },
    );

    expect(result.signals).toHaveLength(2);
    expect(result.covered).toEqual(["1.0.0.0/24", "3.0.0.0/24"]);
  });

  test("enrichment names the category, at the cost of a call", async () => {
    const { result, calls } = await poll(
      { blocks: { "1.0.0.0/24": [reported("1.0.0.5", 90)] } },
      { targets: ["1.0.0.0/24"] },
      { enrichCategories: true },
    );

    expect(calls).toEqual(["block:1.0.0.0/24", "check:1.0.0.5"]);
    expect(result.signals[0]?.type).toBe("abuse.port_scan");
    expect(result.signals[0]?.body).toContain("Port Scan");
  });

  test("enrichment is skipped when it would exceed the budget", async () => {
    const { calls } = await poll(
      { blocks: { "1.0.0.0/24": [reported("1.0.0.5", 90)] } },
      { targets: ["1.0.0.0/24"] },
      { enrichCategories: true, callsPerRun: 1 },
    );

    // The block check spent the only call; the finding survives without a
    // category rather than the sweep overspending.
    expect(calls).toEqual(["block:1.0.0.0/24"]);
  });
});

describe("dominantCategory", () => {
  test("picks the most reported category", () => {
    expect(dominantCategory([14, 14, 11])).toBe("port_scan");
  });

  test("a specific category beats `other` at the same count", () => {
    // A case labelled "other" tells a customer nothing about what to fix.
    expect(dominantCategory([9, 4])).toBe("ddos");
  });

  test("falls back to `other` for an unknown code", () => {
    expect(dominantCategory([999])).toBe("other");
  });

  test("attacks leaving our range read as a compromised host", () => {
    expect(dominantCategory([18, 22, 21])).toBe("compromised");
  });
});

describe("AbuseIpDbSource block size", () => {
  test("splits a wider target into blocks of blockPrefixLength (C5)", async () => {
    const { client, calls } = createClient();
    const source = new AbuseIpDbSource(
      context({ blockPrefixLength: 24 }),
      client,
    );

    const result = await source.poll({
      since: new Date(0),
      targets: [{ cidr: "10.0.0.0/23" }],
      budget: 10,
    });

    expect(calls).toEqual(["block:10.0.0.0/24", "block:10.0.1.0/24"]);
    expect(result.covered).toEqual(["10.0.0.0/23"]);
  });

  test("starts no target whose blocks outnumber the budget", async () => {
    const { client, calls } = createClient();
    const source = new AbuseIpDbSource(
      context({ blockPrefixLength: 24 }),
      client,
    );

    const result = await source.poll({
      since: new Date(0),
      targets: [{ cidr: "10.0.0.0/23" }],
      budget: 1,
    });

    expect(calls).toEqual([]);
    expect(result.covered).toEqual([]);
  });
});

describe("AbuseIpDbSource call budget", () => {
  test("spends a call on a failing block, so a run of failures stops at its budget", async () => {
    const { calls, result } = await poll(
      { failing: ["1.0.0.0/24", "2.0.0.0/24"] },
      { targets: ["1.0.0.0/24", "2.0.0.0/24"], budget: 1 },
    );

    expect(calls).toEqual(["block:1.0.0.0/24"]);
    expect(result.covered).toEqual([]);
  });

  test("spends a call on a failing lookup, so enrichment never exceeds the budget", async () => {
    const { calls } = await poll(
      {
        failingChecks: ["1.0.0.5"],
        blocks: { "1.0.0.0/24": [reported("1.0.0.5", 90)] },
      },
      { targets: ["1.0.0.0/24", "2.0.0.0/24"] },
      { enrichCategories: true, callsPerRun: 2 },
    );

    expect(calls).toEqual(["block:1.0.0.0/24", "check:1.0.0.5"]);
  });

  test("never spends on enrichment the calls a started target still needs", async () => {
    const { calls, result } = await poll(
      { blocks: { "10.0.0.0/25": [reported("10.0.0.5", 90)] } },
      { targets: ["10.0.0.0/24"] },
      { blockPrefixLength: 25, callsPerRun: 2, enrichCategories: true },
    );

    expect(calls).toEqual(["block:10.0.0.0/25", "block:10.0.0.128/25"]);
    expect(result.covered).toEqual(["10.0.0.0/24"]);
    expect(result.signals[0]?.type).toBe("abuse.other");
  });

  test("keeps the order of block and lookup calls at the default block size", async () => {
    const { calls, result } = await poll(
      {
        blocks: {
          "1.0.0.0/24": [reported("1.0.0.5", 90)],
          "2.0.0.0/24": [reported("2.0.0.5", 90)],
        },
      },
      { targets: ["1.0.0.0/24", "2.0.0.0/24", "3.0.0.0/24"] },
      { enrichCategories: true, callsPerRun: 3 },
    );

    expect(calls).toEqual([
      "block:1.0.0.0/24",
      "check:1.0.0.5",
      "block:2.0.0.0/24",
    ]);
    expect(result.covered).toEqual(["1.0.0.0/24", "2.0.0.0/24"]);
  });
});

describe("AbuseIpDbSource sweep plan", () => {
  test("finishes the first target and leaves the second untouched when the calls cover one", async () => {
    const { calls, result } = await poll(
      {},
      { targets: ["10.0.0.0/24", "10.0.1.0/24"] },
      { blockPrefixLength: 26, callsPerRun: 4 },
    );

    expect(calls).toEqual([
      "block:10.0.0.0/26",
      "block:10.0.0.64/26",
      "block:10.0.0.128/26",
      "block:10.0.0.192/26",
    ]);
    expect(result.covered).toEqual(["10.0.0.0/24"]);
  });

  test("starts no target it cannot finish, and warns once per such target", async () => {
    const { calls, result, warnings } = await poll(
      {},
      { targets: ["10.0.0.0/24", "10.0.1.0/24"] },
      { blockPrefixLength: 26, callsPerRun: 2 },
    );

    expect(calls).toEqual([]);
    expect(result.covered).toEqual([]);
    expect(warnings.map((warning) => warning.fields)).toEqual([
      { cidr: "10.0.0.0/24", blocks: 4, calls: 2 },
      { cidr: "10.0.1.0/24", blocks: 4, calls: 2 },
    ]);
  });

  test("asks about a /24 target as it is when blockPrefixLength is below 24", async () => {
    const { calls, result } = await poll(
      {},
      { targets: ["10.0.0.0/24"] },
      { blockPrefixLength: 20 },
    );

    expect(calls).toEqual(["block:10.0.0.0/24"]);
    expect(result.covered).toEqual(["10.0.0.0/24"]);
  });
});

describe("AbuseIpDbSource failures", () => {
  const API_KEY = "abuseipdb-source-key-0123456789";

  const sourceOn = (fake: ReturnType<typeof createFakeAbuseIpDb>) =>
    new AbuseIpDbSource(
      context(),
      createAbuseIpDbClient({
        apiKey: API_KEY,
        http: createIntegrationHttp({
          integrationId: "abuseipdb",
          redactor: createRedactor([API_KEY]),
          fetch: fake.fetch,
        }),
      }),
    );

  test("rejects when AbuseIPDB refuses the key, so the poller reports the run as failed", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);
    fake.answerWith(401, { errors: [{ detail: "Authentication failed." }] });

    await expect(
      sourceOn(fake).poll({
        since: new Date(0),
        targets: [{ cidr: "10.0.0.0/24" }, { cidr: "10.0.1.0/24" }],
        budget: 4,
      }),
    ).rejects.toMatchObject({ code: "abuseipdb.request_failed" });
    expect(fake.calls()).toBe(1);
  });

  test("rejects a malformed target before spending a call", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);

    await expect(
      sourceOn(fake).poll({
        since: new Date(0),
        targets: [{ cidr: "10.0.0.0" }],
        budget: 4,
      }),
    ).rejects.toMatchObject({ code: "abuseipdb.invalid_target" });
    expect(fake.calls()).toBe(0);
  });

  test("keeps a finding whose lookup the provider refuses, without its category", async () => {
    const { result } = await poll(
      {
        failingChecks: ["1.0.0.5"],
        checkFailure: new IntegrationError({
          code: "abuseipdb.unexpected_response",
          message: "GET /check answered with a body that is not AbuseIPDB's",
        }),
        blocks: { "1.0.0.0/24": [reported("1.0.0.5", 90)] },
      },
      { targets: ["1.0.0.0/24"] },
      { enrichCategories: true },
    );

    expect(result.signals.map((signal) => signal.type)).toEqual([
      "abuse.other",
    ]);
    expect(result.covered).toEqual(["1.0.0.0/24"]);
  });

  test("stops on the daily quota during a lookup and keeps what it covered", async () => {
    const { result } = await poll(
      {
        failingChecks: ["2.0.0.5"],
        checkFailure: new IntegrationError({
          code: QUOTA_EXHAUSTED,
          message: "AbuseIPDB daily quota exhausted",
        }),
        blocks: {
          "1.0.0.0/24": [reported("1.0.0.5", 90)],
          "2.0.0.0/24": [reported("2.0.0.5", 90)],
        },
      },
      { targets: ["1.0.0.0/24", "2.0.0.0/24", "3.0.0.0/24"] },
      { enrichCategories: true },
    );

    expect(result.covered).toEqual(["1.0.0.0/24"]);
    expect(result.signals.map((signal) => signal.subject)).toEqual([
      { kind: "ip", value: "1.0.0.5" },
    ]);
  });

  test("rethrows an error that is not an IntegrationError, because the client translates every provider failure", async () => {
    const { client } = createClient();
    const source = new AbuseIpDbSource(context(), {
      ...client,
      checkBlock: async () => {
        throw new TypeError("a defect in this package");
      },
    });

    await expect(
      source.poll({
        since: new Date(0),
        targets: [{ cidr: "10.0.0.0/24" }],
        budget: 2,
      }),
    ).rejects.toThrow("a defect in this package");
  });
});
