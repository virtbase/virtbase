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
import { dominantCategory } from "../categories";
import type {
  AbuseIpDbCheck,
  AbuseIpDbCheckBlock,
  AbuseIpDbClient,
} from "../client";
import { AbuseIpDbQuotaError } from "../client";
import type { AbuseIpDbContext, AbuseIpDbSettings } from "../config";
import { AbuseIpDbSource } from "../source";

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

const context = (overrides: Partial<AbuseIpDbSettings> = {}) =>
  ({
    id: "abuseipdb",
    settings: settings(overrides),
    secrets: { apiKey: "k".repeat(20) },
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    ports: {
      resolve: async () => null,
      require: async () => {
        throw new Error("not used");
      },
    },
    waitUntil: () => undefined,
  }) as unknown as AbuseIpDbContext;

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

interface FakeClientOptions {
  blocks?: Record<string, ReturnType<typeof reported>[]>;
  /** Ranges that raise the daily-quota error instead of answering. */
  exhaustedAfter?: number;
  failing?: string[];
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
        throw new AbuseIpDbQuotaError(3600);
      }
      if (options.failing?.includes(network)) {
        throw new Error("network unreachable");
      }

      return {
        networkAddress: network.split("/")[0] as string,
        reportedAddress: options.blocks?.[network] ?? [],
      };
    },
    async check(ip): Promise<AbuseIpDbCheck> {
      calls.push(`check:${ip}`);
      return {
        ipAddress: ip,
        abuseConfidenceScore: 90,
        totalReports: 4,
        reports: [
          { reportedAt: "2026-08-28T10:00:00+00:00", categories: [14] },
        ],
        ...options.checks?.[ip],
      } as AbuseIpDbCheck;
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
  const source = new AbuseIpDbSource(context(overrides), client);

  return source
    .poll({
      since: new Date("2026-08-01T00:00:00Z"),
      targets: request.targets.map((cidr) => ({ cidr })),
      // What the platform offers: a range may cost more than one call.
      budget: request.budget ?? request.targets.length * 2,
    })
    .then((result) => ({ result, calls }));
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
