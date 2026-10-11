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
import { IntegrationError, isIntegrationError } from "../errors";
import type { LogSink } from "../logger";
import { createIntegrationLogger } from "../logger";
import { createRedactor } from "../redact";

describe("IntegrationError", () => {
  test("carries its code, retryability, params and cause", () => {
    const cause = new Error("socket hang up");
    const error = new IntegrationError({
      code: "powerdns.zone_missing",
      message: "No zone for 10.0.0.0/24",
      params: { cidr: "10.0.0.0/24" },
      cause,
    });

    expect(error).toMatchObject({
      name: "IntegrationError",
      code: "powerdns.zone_missing",
      retryable: false,
      params: { cidr: "10.0.0.0/24" },
      message: "No zone for 10.0.0.0/24",
    });
    expect(error.cause).toBe(cause);
    expect(isIntegrationError(error)).toBe(true);
    expect(isIntegrationError(new Error("x"))).toBe(false);
  });
});

describe("createIntegrationLogger", () => {
  test("prefixes every level and adds the integration field", () => {
    const lines: string[] = [];
    const record =
      (level: string) => (message: string, fields: Record<string, unknown>) =>
        lines.push(`${level} ${message} ${JSON.stringify(fields)}`);
    const sink: LogSink = {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    };
    const logger = createIntegrationLogger({
      integrationId: "discord",
      redactor: createRedactor(["bot-token-1"]),
      sink,
    });

    logger.debug("a");
    logger.info("b", { n: 1 });
    logger.warn("c bot-token-1");
    logger.error("d", { token: "bot-token-1" });

    expect(lines).toEqual([
      'debug [integrations:discord] a {"integration":"discord"}',
      'info [integrations:discord] b {"n":1,"integration":"discord"}',
      'warn [integrations:discord] c [redacted] {"integration":"discord"}',
      'error [integrations:discord] d {"token":"[redacted]","integration":"discord"}',
    ]);
  });
});

describe("createIntegrationLogger fields", () => {
  test("a caller's field cannot replace the integration field", () => {
    const fields: Record<string, unknown>[] = [];
    const record = (_: string, entry: Record<string, unknown>) => {
      fields.push(entry);
    };
    const logger = createIntegrationLogger({
      integrationId: "discord",
      redactor: createRedactor([]),
      sink: { debug: record, info: record, warn: record, error: record },
    });

    logger.info("x", { integration: "stripe" });

    expect(fields).toEqual([{ integration: "discord" }]);
  });
});
