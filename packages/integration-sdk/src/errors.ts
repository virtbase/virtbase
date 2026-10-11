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

/** A stable error code: the integration's id, a dot, and the reason. */
export type IntegrationErrorCode = `${string}.${string}`;

/**
 * The one error type integration code throws (INT-5).
 *
 * `code` is stable, so callers branch on it; `message` is the untranslated
 * English for logs.
 * `retryable` says whether the same call can succeed later, and `params`
 * carries the values a translated message needs. A message, a param or a
 * cause must never hold a secret: `ctx.http` and `ctx.logger` redact the
 * values they know, and an integration building its own error must too.
 */
export class IntegrationError extends Error {
  override readonly name = "IntegrationError";
  readonly code: IntegrationErrorCode;
  readonly retryable: boolean;
  readonly params: Readonly<Record<string, string | number>>;

  constructor({
    code,
    message,
    retryable = false,
    params = {},
    cause,
  }: {
    code: IntegrationErrorCode;
    message: string;
    retryable?: boolean;
    params?: Record<string, string | number>;
    cause?: unknown;
  }) {
    super(message, { cause });
    this.code = code;
    this.retryable = retryable;
    this.params = params;
  }
}

/** Whether `error` is an {@link IntegrationError}. */
export const isIntegrationError = (error: unknown): error is IntegrationError =>
  error instanceof IntegrationError;
