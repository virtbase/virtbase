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
  decideAfterResponse,
  HTTP_RETRIES,
  HTTP_RETRY_AFTER_MAX_MS,
  HTTP_TIMEOUT_MAX_MS,
  readRetryAfterMs,
  resolveTimeoutMs,
} from "../http";
import { createRedactor } from "../redact";

/** A fetch that answers from a list of statuses, and records what it was given. */
const scripted = (responses: (() => Response)[]) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("no scripted response left");
    return next();
  };
  return { fetch, calls };
};

const client = (
  fetch: (input: string | URL, init?: RequestInit) => Promise<Response>,
) => {
  const sleeps: number[] = [];
  const urls: string[] = [];
  const http = createIntegrationHttp({
    integrationId: "acme",
    redactor: createRedactor(["sk-live-0123456789"]),
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    onRequest: (event) => urls.push(event.url),
  });
  return { http, sleeps, urls };
};

describe("resolveTimeoutMs", () => {
  test("caps the integration's limit at HTTP_TIMEOUT_MAX_MS", () => {
    expect(resolveTimeoutMs(60_000)).toBe(HTTP_TIMEOUT_MAX_MS);
  });

  test("lets a call lower the limit but never raise it", () => {
    expect(resolveTimeoutMs(10_000, 2_000)).toBe(2_000);
    expect(resolveTimeoutMs(10_000, 20_000)).toBe(10_000);
  });
});

describe("readRetryAfterMs", () => {
  test("reads seconds and HTTP dates, and nothing else", () => {
    expect(readRetryAfterMs("3")).toBe(3_000);
    expect(
      readRetryAfterMs("Sun, 11 Oct 2026 00:00:10 GMT", () =>
        Date.parse("2026-10-11T00:00:00Z"),
      ),
    ).toBe(10_000);
    expect(readRetryAfterMs(null)).toBeNull();
    expect(readRetryAfterMs("soon")).toBeNull();
  });
});

describe("decideAfterResponse", () => {
  test("returns a status that is not retried, and the last attempt", () => {
    expect(
      decideAfterResponse({
        status: 404,
        retryAfterMs: null,
        attempt: 1,
        attempts: 3,
      }),
    ).toEqual({ kind: "return" });
    expect(
      decideAfterResponse({
        status: 503,
        retryAfterMs: null,
        attempt: 3,
        attempts: 3,
      }),
    ).toEqual({ kind: "return" });
  });

  test("retries after Retry-After up to HTTP_RETRY_AFTER_MAX_MS, and returns a longer one", () => {
    expect(
      decideAfterResponse({
        status: 429,
        retryAfterMs: 1_000,
        attempt: 1,
        attempts: 3,
      }),
    ).toEqual({ kind: "retry", delayMs: 1_000 });
    expect(
      decideAfterResponse({
        status: 429,
        retryAfterMs: HTTP_RETRY_AFTER_MAX_MS + 1,
        attempt: 1,
        attempts: 3,
      }),
    ).toEqual({ kind: "return" });
  });
});

describe("createIntegrationHttp retries", () => {
  test("waits for a short Retry-After instead of the backoff", async () => {
    const { fetch } = scripted([
      () => new Response("", { status: 429, headers: { "retry-after": "1" } }),
      () => new Response("ok"),
    ]);
    const { http, sleeps } = client(fetch);

    expect((await http.request("https://api.example/")).status).toBe(200);
    expect(sleeps).toEqual([1_000]);
  });

  test("never retries more than HTTP_RETRIES times, whatever the call asks", async () => {
    const { fetch, calls } = scripted(
      Array.from({ length: 10 }, () => () => new Response("", { status: 503 })),
    );
    const { http } = client(fetch);

    await http.request("https://api.example/", { retries: 10 });

    expect(calls).toHaveLength(1 + HTTP_RETRIES);
  });

  test("never retries a streamed body, which can only be sent once", async () => {
    const { fetch, calls } = scripted([
      () => new Response("", { status: 503 }),
    ]);
    const { http } = client(fetch);

    const response = await http.request("https://api.example/", {
      method: "PUT",
      body: new ReadableStream(),
    });

    expect(response.status).toBe(503);
    expect(calls).toHaveLength(1);
  });

  test("cancels the body of a response it retries", async () => {
    let cancelled = false;
    const { fetch } = scripted([
      () =>
        new Response(
          new ReadableStream({
            cancel: () => {
              cancelled = true;
            },
          }),
          { status: 503 },
        ),
      () => new Response("ok"),
    ]);
    const { http } = client(fetch);

    await http.request("https://api.example/");

    expect(cancelled).toBe(true);
  });

  test("stops without another attempt when the caller aborts during the backoff", async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const http = createIntegrationHttp({
      integrationId: "acme",
      redactor: createRedactor([]),
      fetch: async (input) => {
        calls.push(String(input));
        return new Response("", { status: 503 });
      },
      sleep: async () => {
        controller.abort();
      },
    });

    const error = await http
      .request("https://api.example/", { signal: controller.signal })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "acme.http_aborted" });
    expect(calls).toHaveLength(1);
  });

  test("redacts a per-request token from the reported URL", async () => {
    const { fetch } = scripted([() => new Response("ok")]);
    const { http, urls } = client(fetch);

    await http.request(
      "https://discord.example/webhooks/1/interaction-token-1",
      {
        method: "POST",
        redact: ["interaction-token-1"],
      },
    );

    expect(urls).toEqual(["https://discord.example/webhooks/1/[redacted]"]);
  });
});
