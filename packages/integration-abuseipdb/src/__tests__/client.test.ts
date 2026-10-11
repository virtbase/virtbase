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
} from "@virtbase/integration-sdk";
import { createAbuseIpDbClient } from "../client";
import { createFakeAbuseIpDb } from "./fake-abuseipdb";

const API_KEY = "abuseipdb-client-key-0123456789";

const clientOn = (
  fake: ReturnType<typeof createFakeAbuseIpDb>,
  apiKey = API_KEY,
) =>
  createAbuseIpDbClient({
    apiKey,
    http: createIntegrationHttp({
      integrationId: "abuseipdb",
      redactor: createRedactor([apiKey]),
      fetch: fake.fetch,
    }),
  });

describe("createAbuseIpDbClient", () => {
  test("reads the remaining quota from every answer", async () => {
    const client = clientOn(createFakeAbuseIpDb(API_KEY));

    await client.check("192.0.2.7");

    expect(client.quotaRemaining).toBe(999);
  });

  test("a 429 is the daily quota, never retried", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);
    fake.answerWith(429, {
      errors: [{ detail: "Daily rate limit of 1000 requests exceeded." }],
    });

    await expect(clientOn(fake).check("192.0.2.7")).rejects.toMatchObject({
      code: "abuseipdb.quota_exhausted",
      retryable: false,
    });
    expect(fake.calls()).toBe(1);
  });

  test("a rejected key fails not retryable, with the provider's detail as a param rather than in the message (INT-5)", async () => {
    await expect(
      clientOn(createFakeAbuseIpDb(API_KEY), "wrong-key-0123456789abc").check(
        "192.0.2.7",
      ),
    ).rejects.toMatchObject({
      code: "abuseipdb.request_failed",
      retryable: false,
      message: "GET /check answered 401",
      params: { status: 401, detail: "Authentication failed." },
    });
  });

  test("a failure without AbuseIPDB's error body carries the status alone", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);
    fake.answerWith(404, null);

    await expect(clientOn(fake).check("192.0.2.7")).rejects.toMatchObject({
      message: "GET /check answered 404",
      params: { status: 404 },
    });
  });

  test("a failure whose body is not JSON carries the status alone", async () => {
    const client = createAbuseIpDbClient({
      apiKey: API_KEY,
      http: createIntegrationHttp({
        integrationId: "abuseipdb",
        redactor: createRedactor([API_KEY]),
        fetch: async () =>
          new Response("<html>Bad gateway</html>", { status: 502 }),
      }),
    });

    await expect(client.checkBlock("10.0.0.0/24")).rejects.toMatchObject({
      message: "GET /check-block answered 502",
      params: { status: 502 },
      retryable: true,
    });
  });

  test("a 5xx is retryable for the caller, though the client does not retry it", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);
    fake.answerWith(503, null);

    await expect(
      clientOn(fake).checkBlock("10.0.0.0/24"),
    ).rejects.toMatchObject({
      code: "abuseipdb.request_failed",
      retryable: true,
    });
    expect(fake.calls()).toBe(1);
  });

  test("ignores a field AbuseIPDB adds to an answer", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);
    fake.answerWith(200, {
      data: {
        ipAddress: "192.0.2.7",
        abuseConfidenceScore: 0,
        totalReports: 0,
        addedByTheProvider: { nested: true },
      },
    });

    await expect(clientOn(fake).check("192.0.2.7")).resolves.toEqual({
      ipAddress: "192.0.2.7",
      abuseConfidenceScore: 0,
      totalReports: 0,
    });
  });

  test("a body that is not AbuseIPDB's is an unexpected response", async () => {
    const fake = createFakeAbuseIpDb(API_KEY);
    fake.answerWith(200, { status: "ok" });

    await expect(clientOn(fake).check("192.0.2.7")).rejects.toMatchObject({
      code: "abuseipdb.unexpected_response",
    });
  });
});
