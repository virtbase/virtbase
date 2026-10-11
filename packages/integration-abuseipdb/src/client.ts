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

import type {
  IntegrationHttp,
  IntegrationLogger,
} from "@virtbase/integration-sdk";
import {
  IntegrationError,
  isIntegrationError,
} from "@virtbase/integration-sdk";
import * as z from "zod";

const API_BASE = "https://api.abuseipdb.com/api/v2";

/** The code of the error thrown when the daily quota is gone. */
export const QUOTA_EXHAUSTED = "abuseipdb.quota_exhausted";

/**
 * Whether `error` is the daily quota running out. The poller treats it as
 * "stop and come back tomorrow" rather than "retry": retrying a 429 against a
 * daily quota only spends the next day's as well.
 */
export const isQuotaExhausted = (error: unknown): boolean =>
  isIntegrationError(error) && error.code === QUOTA_EXHAUSTED;

const ErrorBodySchema = z.object({
  errors: z.array(z.object({ detail: z.string() })).min(1),
});

/**
 * The fields of a `/check` answer this package reads. `z.object` strips every
 * other key, so a field AbuseIPDB adds never fails the parse.
 */
const checkSchema = z.object({
  data: z.object({
    ipAddress: z.string(),
    abuseConfidenceScore: z.number(),
    countryCode: z.string().nullable().optional(),
    usageType: z.string().nullable().optional(),
    totalReports: z.number().default(0),
    lastReportedAt: z.string().nullable().optional(),
    reports: z
      .array(z.object({ categories: z.array(z.number()).default([]) }))
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

/** One address as `/check` describes it, reduced to the fields this package reads. */
export type AbuseIpDbCheck = z.output<typeof checkSchema>["data"];
/** One block as `/check-block` describes it, with every address reported in it. */
export type AbuseIpDbCheckBlock = z.output<typeof checkBlockSchema>["data"];

/** What {@link createAbuseIpDbClient} needs. */
export interface AbuseIpDbClientOptions {
  apiKey: string;
  /** `ctx.http`: every request goes through it (INT-4). */
  http: IntegrationHttp;
  logger?: IntegrationLogger;
}

/** AbuseIPDB's API v2, as far as this package uses it; built by {@link createAbuseIpDbClient}. */
export interface AbuseIpDbClient {
  /** Remaining daily quota as of the last response, or null before the first. */
  readonly quotaRemaining: number | null;
  /** `GET /check`: one address and, with `verbose`, its reports. */
  check(
    ip: string,
    options?: { maxAgeInDays?: number; verbose?: boolean },
  ): Promise<AbuseIpDbCheck>;
  /** `GET /check-block`: every reported address inside `network`. */
  checkBlock(
    network: string,
    options?: { maxAgeInDays?: number },
  ): Promise<AbuseIpDbCheckBlock>;
  /** `POST /report`: publishes a report against `ip`. */
  report(input: {
    ip: string;
    categories: number[];
    comment: string;
  }): Promise<{ ipAddress: string }>;
}

/** The remaining daily quota an answer reports, or null when it reports none. */
const readQuotaRemaining = (response: Response): number | null => {
  const header = response.headers.get("x-ratelimit-remaining");
  const parsed = header ? Number.parseInt(header, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const quotaExhausted = (response: Response) => {
  const retryAfter = Number.parseInt(
    response.headers.get("retry-after") ?? "",
    10,
  );
  return new IntegrationError({
    code: QUOTA_EXHAUSTED,
    message: "AbuseIPDB daily quota exhausted",
    params: Number.isFinite(retryAfter)
      ? { retryAfterSeconds: retryAfter }
      : {},
  });
};

/**
 * The error for an answer other than 2xx or 429. AbuseIPDB's own detail goes
 * into `params.detail`, never into the message (INT-5).
 */
const requestFailed = ({
  method,
  path,
  status,
  body,
}: {
  method: string;
  path: string;
  status: number;
  body: unknown;
}) => {
  const detail = ErrorBodySchema.safeParse(body).data?.errors[0]?.detail;
  return new IntegrationError({
    code: "abuseipdb.request_failed",
    message: `${method} ${path} answered ${status}`,
    retryable: status >= 500,
    params: detail ? { status, detail } : { status },
  });
};

/** Sends one request and reads its answer; see {@link createAbuseIpDbClient}. */
const createRequest =
  ({
    apiKey,
    http,
    logger,
    onQuota,
  }: {
    apiKey: string;
    http: IntegrationHttp;
    logger?: IntegrationLogger;
    onQuota: (remaining: number) => void;
  }) =>
  async <T>(
    path: string,
    schema: z.ZodType<T>,
    init: {
      method: "GET" | "POST";
      query?: Record<string, string>;
      body?: URLSearchParams;
    },
  ): Promise<T> => {
    const built = buildRequest({ apiKey, path, init });
    const response = await http.request(built.url, built.init);
    // Read on every answer, failures included: the header is how the poller
    // knows how much of today's budget is left.
    const remaining = readQuotaRemaining(response);
    if (remaining !== null) onQuota(remaining);

    if (429 === response.status) {
      await response.body?.cancel();
      logger?.warn("Daily quota exhausted");
      throw quotaExhausted(response);
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw requestFailed({
        method: init.method,
        path,
        status: response.status,
        body,
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new IntegrationError({
        code: "abuseipdb.unexpected_response",
        message: `${init.method} ${path} answered with a body that is not AbuseIPDB's`,
      });
    }
    return parsed.data;
  };

/** The query string and headers of one request. */
const buildRequest = ({
  apiKey,
  path,
  init,
}: {
  apiKey: string;
  path: string;
  init: {
    method: "GET" | "POST";
    query?: Record<string, string>;
    body?: URLSearchParams;
  };
}) => {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    url.searchParams.set(key, value);
  }
  return {
    url,
    init: {
      method: init.method,
      retries: 0,
      headers: {
        Key: apiKey,
        Accept: "application/json",
        ...(init.body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(init.body ? { body: init.body } : {}),
    },
  };
};

/**
 * The only thing in this package that talks HTTP to AbuseIPDB.
 *
 * Hand-rolled rather than `abuseipdb-client`: it wraps three REST endpoints,
 * and the provider's answers are validated with Zod here either way.
 *
 * The credential arrives as an argument rather than from `process.env` — it
 * lives in `integration_secrets`, and the context the registry builds is the
 * one place it is decrypted.
 *
 * Requests are never retried: every call costs quota, so a retry after a
 * counted call spends more of it. Failures throw `IntegrationError`s:
 * `abuseipdb.quota_exhausted` on a 429, `abuseipdb.request_failed` on any
 * other response than 2xx (retryable for 5xx), and
 * `abuseipdb.unexpected_response` on a body that is not AbuseIPDB's.
 */
export const createAbuseIpDbClient = ({
  apiKey,
  http,
  logger,
}: AbuseIpDbClientOptions): AbuseIpDbClient => {
  let quotaRemaining: number | null = null;

  const request = createRequest({
    apiKey,
    http,
    logger,
    onQuota: (remaining) => {
      quotaRemaining = remaining;
    },
  });

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
