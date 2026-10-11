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
import { IntegrationError } from "../errors";
import { createIntegrationHttp, HTTP_TIMEOUT_MAX_MS } from "../http";
import { createRedactor } from "../redact";

const SECRET = "sk-live-0123456789";
const statuses: number[] = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/hang") await Bun.sleep(1_000);
      const status = statuses.shift() ?? 200;
      return new Response(request.method, { status });
    },
  });
});

afterAll(async () => {
  await server.stop(true);
});

const url = (path: string) => `http://localhost:${server.port}${path}`;

const http = (options: { timeoutMs?: number } = {}) => {
  const sleeps: number[] = [];
  const attempts: (number | null)[] = [];
  const client = createIntegrationHttp({
    integrationId: "acme",
    redactor: createRedactor([SECRET]),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    onRequest: (event) => attempts.push(event.status),
    ...options,
  });
  return { client, sleeps, attempts };
};

describe("createIntegrationHttp", () => {
  test("returns a response whatever its status", async () => {
    statuses.push(404);
    const { client } = http();

    expect((await client.request(url("/"))).status).toBe(404);
  });

  test("retries an idempotent request on 503, with full-jitter backoff", async () => {
    statuses.push(503, 503, 200);
    const { client, sleeps, attempts } = http();

    const response = await client.request(url("/"));

    expect(response.status).toBe(200);
    expect(attempts).toEqual([503, 503, 200]);
    expect(sleeps).toEqual([100, 200]);
  });

  test("returns the last retried status once the retries are spent", async () => {
    statuses.push(503, 503, 503);
    const { client } = http();

    expect((await client.request(url("/"), { method: "PUT" })).status).toBe(
      503,
    );
  });

  test("never retries POST", async () => {
    statuses.push(503);
    const { client, attempts } = http();

    const response = await client.request(url("/"), {
      method: "POST",
      body: "x",
    });

    expect(response.status).toBe(503);
    expect(attempts).toEqual([503]);
  });

  test("throws a redacted http_timeout error once every attempt times out", async () => {
    const { client, attempts } = http({ timeoutMs: 20 });

    const error = await client
      .request(url(`/hang?key=${SECRET}`))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({
      code: "acme.http_timeout",
      retryable: true,
      message: `GET ${url("/hang")}?[redacted] got no response within 20 ms`,
    });
    expect(attempts).toEqual([null, null, null]);
  });

  test("lets a call lower the timeout but never raise it past the limit", async () => {
    const { client } = http({ timeoutMs: 20 });

    const error = await client
      .request(url("/hang"), { timeoutMs: HTTP_TIMEOUT_MAX_MS, retries: 0 })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      message: `GET ${url("/hang")} got no response within 20 ms`,
    });
  });

  test("throws http_unreachable, with the secret redacted from the cause", async () => {
    const { client } = http();

    const error = await client
      .request(`http://localhost:1/${SECRET}`, { retries: 0 })
      .catch((caught: unknown) => caught);

    if (!(error instanceof IntegrationError)) throw error;
    expect(error).toMatchObject({
      code: "acme.http_unreachable",
      retryable: true,
    });
    expect(error.message).not.toContain(SECRET);
    expect(String(error.cause)).not.toContain(SECRET);
  });

  test("does not retry once the caller aborts, and says so", async () => {
    const controller = new AbortController();
    const { client, attempts } = http();
    const pending = client.request(url("/hang"), { signal: controller.signal });
    controller.abort();

    const error = await pending.catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "acme.http_aborted",
      retryable: false,
    });
    expect(attempts).toEqual([null]);
  });
});
