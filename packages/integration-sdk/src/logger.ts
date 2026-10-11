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

import type { Redactor } from "./redact";
import type { IntegrationLogger } from "./types";

/** Where log lines go; `console` unless a test passes its own. */
export type LogSink = Record<
  keyof IntegrationLogger,
  (message: string, fields: Record<string, unknown>) => void
>;

/** The registry's own logger, for lines about an integration rather than from one. */
export const consoleLogger: IntegrationLogger = {
  debug: (message, fields) => console.debug(message, fields ?? ""),
  info: (message, fields) => console.info(message, fields ?? ""),
  warn: (message, fields) => console.warn(message, fields ?? ""),
  error: (message, fields) => console.error(message, fields ?? ""),
};

const consoleSink: LogSink = {
  debug: (message, fields) => console.debug(message, fields),
  info: (message, fields) => console.info(message, fields),
  warn: (message, fields) => console.warn(message, fields),
  error: (message, fields) => console.error(message, fields),
};

/**
 * The `ctx.logger` of one integration (ADR 0003, INT-6).
 *
 * Every line starts with `[integrations:<id>]` and carries `integration: <id>`
 * as a field, and the message and every string in the fields pass through the
 * integration's redactor, so a declared secret never reaches the log.
 */
export const createIntegrationLogger = ({
  integrationId,
  redactor,
  sink = consoleSink,
}: {
  integrationId: string;
  redactor: Redactor;
  sink?: LogSink;
}): IntegrationLogger => {
  const write =
    (level: keyof IntegrationLogger) =>
    (message: string, fields: Record<string, unknown> = {}) =>
      sink[level](`[integrations:${integrationId}] ${redactor.text(message)}`, {
        ...redactor.fields(fields),
        integration: integrationId,
      });
  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
};
