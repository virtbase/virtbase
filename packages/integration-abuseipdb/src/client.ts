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

import type { IntegrationLogger } from "@virtbase/integration-sdk";
import * as z from "zod";

const API_BASE = "https://api.abuseipdb.com/api/v2";

/**
 * Raised when the daily quota is gone.
 *
 * Distinct from a transport failure because the poller treats it as "stop and
 * come back tomorrow" rather than "retry" - retrying a 429 against a daily
 * quota just burns the next day's as well.
 */
export class AbuseIpDbQuotaError extends Error {
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null) {
    super("AbuseIPDB daily quota exhausted");
    this.name = "AbuseIpDbQuotaError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AbuseIpDbError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`AbuseIPDB responded ${status}: ${detail}`);
    this.name = "AbuseIpDbError";
    this.status = status;
  }
}

/**
 * Only the fields we use.
 *
 * Passthrough rather than strict: the provider adds fields, and a new one
 * appearing must not take the abuse desk down.
 */
const checkSchema = z.object({
  data: z.object({
    ipAddress: z.string(),
    isPublic: z.boolean().optional(),
    isWhitelisted: z.boolean().nullable().optional(),
    abuseConfidenceScore: z.number(),
    countryCode: z.string().nullable().optional(),
    usageType: z.string().nullable().optional(),
    isp: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    totalReports: z.number().default(0),
    numDistinctUsers: z.number().optional(),
    lastReportedAt: z.string().nullable().optional(),
    reports: z
      .array(
        z.object({
          reportedAt: z.string(),
          categories: z.array(z.number()).default([]),
          reporterCountryCode: z.string().nullable().optional(),
        }),
      )
      .optional(),
  }),
});

const checkBlockSchema = z.object({
  data: z.object({
    networkAddress: z.string(),
    netmask: z.string().optional(),
    reportedAddress: z
      .array(
        z.object({
          ipAddress: z.string(),
          numReports: z.number().default(0),
          mostRecentReport: z.string().nullable().optional(),
          abuseConfidenceScore: z.number().default(0),
          countryCode: z.string().nullable().optional(),
        }),
      )
      .default([]),
  }),
});

const reportSchema = z.object({
  data: z.object({
    ipAddress: z.string(),
    abuseConfidenceScore: z.number().optional(),
  }),
});

export type AbuseIpDbCheck = z.output<typeof checkSchema>["data"];
export type AbuseIpDbCheckBlock = z.output<typeof checkBlockSchema>["data"];

export interface AbuseIpDbClientOptions {
  apiKey: string;
  logger?: IntegrationLogger;
  /** Swapped for a stub in tests. */
  fetch?: typeof globalThis.fetch;
}

export interface AbuseIpDbClient {
  /** Remaining daily quota as of the last response, or null before the first. */
  readonly quotaRemaining: number | null;
  check(
    ip: string,
    options?: { maxAgeInDays?: number; verbose?: boolean },
  ): Promise<AbuseIpDbCheck>;
  checkBlock(
    network: string,
    options?: { maxAgeInDays?: number },
  ): Promise<AbuseIpDbCheckBlock>;
  report(input: {
    ip: string;
    categories: number[];
    comment: string;
  }): Promise<{ ipAddress: string }>;
}

/**
 * The only thing in this package that talks HTTP to AbuseIPDB.
 *
 * Hand-rolled rather than `abuseipdb-client`: it wraps four REST endpoints,
 * returns untyped provider shapes we would validate with Zod anyway, and this
 * is the package that decides whether to suspend customers. Every other
 * integration here does the same.
 *
 * The credential arrives as an argument rather than from `process.env` — it
 * lives in `integration_secrets`, and the context the registry builds is the
 * one place it is decrypted.
 */
export const createAbuseIpDbClient = ({
  apiKey,
  logger,
  fetch: fetchImpl = globalThis.fetch,
}: AbuseIpDbClientOptions): AbuseIpDbClient => {
  let quotaRemaining: number | null = null;

  const request = async <T>(
    path: string,
    schema: z.ZodType<T>,
    init: {
      method: "GET" | "POST";
      query?: Record<string, string>;
      body?: URLSearchParams;
    },
  ): Promise<T> => {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await fetchImpl(url.toString(), {
      method: init.method,
      headers: {
        Key: apiKey,
        Accept: "application/json",
        ...(init.body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(init.body ? { body: init.body } : {}),
    });

    // Read on every response, including failures: the header is how the poller
    // knows how much of today's budget is left.
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining !== null && "" !== remaining) {
      const parsed = Number.parseInt(remaining, 10);
      if (Number.isFinite(parsed)) quotaRemaining = parsed;
    }

    if (429 === response.status) {
      const retryAfter = Number.parseInt(
        response.headers.get("retry-after") ?? "",
        10,
      );
      logger?.warn("[abuseipdb] Daily quota exhausted");
      throw new AbuseIpDbQuotaError(
        Number.isFinite(retryAfter) ? retryAfter : null,
      );
    }

    if (!response.ok) {
      throw new AbuseIpDbError(
        response.status,
        await response.text().catch(() => ""),
      );
    }

    return schema.parse(await response.json());
  };

  return {
    get quotaRemaining() {
      return quotaRemaining;
    },

    async check(ip, options = {}) {
      const result = await request("/check", checkSchema, {
        method: "GET",
        query: {
          ipAddress: ip,
          maxAgeInDays: String(options.maxAgeInDays ?? 30),
          ...(options.verbose ? { verbose: "" } : {}),
        },
      });

      return result.data;
    },

    async checkBlock(network, options = {}) {
      const result = await request("/check-block", checkBlockSchema, {
        method: "GET",
        query: {
          network,
          maxAgeInDays: String(options.maxAgeInDays ?? 30),
        },
      });

      return result.data;
    },

    async report({ ip, categories, comment }) {
      const result = await request("/report", reportSchema, {
        method: "POST",
        body: new URLSearchParams({
          ip,
          categories: categories.join(","),
          comment,
        }),
      });

      return { ipAddress: result.data.ipAddress };
    },
  };
};
