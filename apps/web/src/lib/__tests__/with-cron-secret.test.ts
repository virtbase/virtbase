/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const SECRET = "cron-secret-for-tests";

const env: { CRON_SECRET?: string | undefined } = {};
mock.module("@/env.ts", () => ({ env }));

const { withCronSecret } = await import("../with-cron-secret.ts");

const handled: NextRequest[] = [];
const route = withCronSecret(async (request) => {
  handled.push(request);
  return new Response("ran");
});

const call = (authorization?: string) =>
  route(
    new NextRequest("https://app.virtbase.test/api/cron/job", {
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  env.CRON_SECRET = SECRET;
  handled.length = 0;
});

describe("withCronSecret", () => {
  test("runs the handler for the configured bearer secret", async () => {
    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ran");
    expect(handled).toHaveLength(1);
  });

  test("answers 401 without running the handler for a wrong secret", async () => {
    const response = await call("Bearer wrong-secret-of-other-length");

    expect(response.status).toBe(401);
    expect(handled).toHaveLength(0);
  });

  test("answers 401 without running the handler when the header is missing", async () => {
    const response = await call();

    expect(response.status).toBe(401);
    expect(handled).toHaveLength(0);
  });

  test("answers 401 for the secret without the Bearer scheme", async () => {
    const response = await call(SECRET);

    expect(response.status).toBe(401);
    expect(handled).toHaveLength(0);
  });

  test("answers 500 without running the handler when no secret is configured", async () => {
    env.CRON_SECRET = undefined;

    const response = await call("Bearer ");

    expect(response.status).toBe(500);
    expect(handled).toHaveLength(0);
  });
});
