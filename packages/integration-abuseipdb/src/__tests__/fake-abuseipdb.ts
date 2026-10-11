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

import type { FetchLike } from "@virtbase/integration-sdk";

interface Finding {
  ipAddress: string;
  numReports: number;
  mostRecentReport: string;
  abuseConfidenceScore: number;
}

/**
 * A fake AbuseIPDB API v2 as a `fetch`: `GET /check`, `GET /check-block` and
 * `POST /report`, behind the `Key` header, with `X-RateLimit-Remaining` on
 * every answer. `findings` maps a /24 block to the addresses reported in it.
 * `answerWith` makes every request answer that status and body. `calls()`
 * counts every request that reaches the fake, whatever it answers.
 */
export const createFakeAbuseIpDb = (
  apiKey: string,
  findings: Record<string, Finding[]> = {},
) => {
  let calls = 0;
  let remaining = 1000;
  let override: { status: number; body: unknown } | null = null;
  const reports: { ip: string; categories: string; comment: string }[] = [];

  const answer = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "x-ratelimit-remaining": String(remaining) },
    });

  const check = (url: URL) => {
    const ip = url.searchParams.get("ipAddress") ?? "";
    const finding = Object.values(findings)
      .flat()
      .find((entry) => entry.ipAddress === ip);
    return answer({
      data: {
        ipAddress: ip,
        abuseConfidenceScore: finding?.abuseConfidenceScore ?? 0,
        totalReports: finding?.numReports ?? 0,
        lastReportedAt: finding?.mostRecentReport ?? null,
        countryCode: "DE",
        usageType: "Data Center/Web Hosting/Transit",
        reports: finding
          ? [{ reportedAt: finding.mostRecentReport, categories: [14] }]
          : [],
      },
    });
  };

  const checkBlock = (url: URL) => {
    const network = url.searchParams.get("network") ?? "";
    return answer({
      data: {
        networkAddress: network.split("/")[0],
        reportedAddress: findings[network] ?? [],
      },
    });
  };

  const report = (body: unknown) => {
    const form = new URLSearchParams(String(body));
    reports.push({
      ip: form.get("ip") ?? "",
      categories: form.get("categories") ?? "",
      comment: form.get("comment") ?? "",
    });
    return answer({
      data: { ipAddress: form.get("ip"), abuseConfidenceScore: 0 },
    });
  };

  const routes: Record<string, (url: URL, init?: RequestInit) => Response> = {
    "GET /check": check,
    "GET /check-block": checkBlock,
    "POST /report": (_, init) => report(init?.body),
  };

  const fetch: FetchLike = async (input, init) => {
    calls++;
    if (override) return answer(override.body, override.status);
    if (new Headers(init?.headers).get("key") !== apiKey) {
      return answer({ errors: [{ detail: "Authentication failed." }] }, 401);
    }
    remaining--;
    const url = new URL(String(input));
    const route =
      routes[`${init?.method ?? "GET"} ${url.pathname.replace("/api/v2", "")}`];
    return route
      ? route(url, init)
      : answer({ errors: [{ detail: "Not found." }] }, 404);
  };

  return {
    fetch,
    calls: () => calls,
    reports,
    answerWith: (status: number, body: unknown) => {
      override = { status, body };
    },
  };
};
