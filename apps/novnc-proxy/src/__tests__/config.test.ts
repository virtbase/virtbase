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
import * as z from "zod";
import { ConfigSchema } from "../config";

const SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const errorOf = (env: Record<string, string>): string | undefined => {
  const result = ConfigSchema.safeParse(env);
  return result.success ? undefined : z.prettifyError(result.error);
};

describe("ConfigSchema", () => {
  test("defaults the port to 8443", () => {
    expect(ConfigSchema.parse({ NOVNC_PROXY_SECRET: SECRET })).toEqual({
      port: 8443,
      secret: SECRET,
    });
  });

  test("reads the port from PORT", () => {
    expect(
      ConfigSchema.parse({ PORT: "9000", NOVNC_PROXY_SECRET: SECRET }).port,
    ).toBe(9000);
  });

  test("names the secret when it is missing", () => {
    expect(errorOf({})).toContain("NOVNC_PROXY_SECRET is not set");
  });

  test.each(["", "changeme", SECRET.slice(2), `${SECRET}00`, "g".repeat(64)])(
    "refuses %p as the secret, which is not a 256-bit hex key",
    (secret: string) => {
      expect(errorOf({ NOVNC_PROXY_SECRET: secret })).toContain(
        "64 hex characters",
      );
    },
  );

  test.each(["0", "65536", "http", "80.5"])(
    "refuses %p as the port",
    (port: string) => {
      expect(errorOf({ PORT: port, NOVNC_PROXY_SECRET: SECRET })).toContain(
        "PORT",
      );
    },
  );
});
