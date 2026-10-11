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
import { toHttpBreadcrumb } from "../http-breadcrumb";

const event = {
  integrationId: "powerdns",
  method: "PATCH",
  url: "https://dns.example/api/v1/servers/localhost/zones/x?[redacted]",
  attempt: 1,
  durationMs: 42,
};

describe("toHttpBreadcrumb", () => {
  test("records an answered request as info, with every field", () => {
    expect(toHttpBreadcrumb({ ...event, status: 204 })).toEqual({
      category: "integration.http",
      type: "http",
      level: "info",
      data: {
        integration: "powerdns",
        method: "PATCH",
        url: event.url,
        status_code: 204,
        attempt: 1,
        duration_ms: 42,
      },
    });
  });

  test("records a 5xx and a request without a response as warnings", () => {
    expect(toHttpBreadcrumb({ ...event, status: 503 }).level).toBe("warning");
    expect(toHttpBreadcrumb({ ...event, status: null }).level).toBe("warning");
  });
});
