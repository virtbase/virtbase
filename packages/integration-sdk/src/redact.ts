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

/** What a redacted value is replaced with. */
export const REDACTED = "[redacted]";

/**
 * Secret values shorter than this are never redacted: replacing every
 * occurrence of a one- or two-character string would garble every log line,
 * and no credential a provider issues is that short.
 */
const MIN_SECRET_LENGTH = 4;

const QUERY_STRING = /(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g;

/** Every string value in a parsed secrets object, at any depth. */
export const collectSecretValues = (secrets: unknown): string[] => {
  if (typeof secrets === "string") return [secrets];
  if (Array.isArray(secrets)) return secrets.flatMap(collectSecretValues);
  if (typeof secrets === "object" && secrets !== null) {
    return Object.values(secrets).flatMap(collectSecretValues);
  }
  return [];
};

/** Replaces secrets in text, and in every string inside a value. */
export interface Redactor {
  /** The text with every secret and every http(s) query string replaced. */
  text(value: string): string;
  /**
   * A copy of the value with every string redacted. Plain objects and arrays
   * are copied, an `Error` becomes its redacted message, a `Date` its ISO
   * string, any other object its redacted `String()`, and a cycle
   * `[circular]`.
   */
  value(value: unknown): unknown;
  /** {@link value} for a record of log fields. */
  fields(fields: Record<string, unknown>): Record<string, unknown>;
  /** A redactor that also replaces `values`, such as a per-request token. */
  extend(values: readonly string[]): Redactor;
}

/**
 * Builds the redaction `ctx.http` and `ctx.logger` share (ADR 0003): every
 * secret value of at least four characters, its percent-encoded form, and the
 * query string of every http(s) URL become `[redacted]`. Longer values are
 * replaced first, so a secret that contains another is redacted whole.
 */
export const createRedactor = (secrets: readonly string[]): Redactor => {
  const values = [
    ...new Set(
      secrets.flatMap((secret) => [secret, encodeURIComponent(secret)]),
    ),
  ]
    .filter((secret) => secret.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length);

  const text = (input: string): string =>
    values
      .reduce((result, secret) => result.replaceAll(secret, REDACTED), input)
      .replace(QUERY_STRING, `$1?${REDACTED}`);

  const copy = (input: unknown, seen: WeakSet<object>): unknown => {
    if (typeof input === "string") return text(input);
    if (typeof input !== "object" || input === null) return input;
    if (input instanceof Error) return text(input.message);
    if (input instanceof Date) return input.toISOString();
    if (seen.has(input)) return "[circular]";
    seen.add(input);
    if (Array.isArray(input)) return input.map((entry) => copy(entry, seen));
    if (Object.getPrototypeOf(input) === Object.prototype) {
      return Object.fromEntries(
        Object.entries(input).map(([key, entry]) => [key, copy(entry, seen)]),
      );
    }
    return text(String(input));
  };

  const fields = (input: Record<string, unknown>): Record<string, unknown> => {
    const seen = new WeakSet<object>([input]);
    return Object.fromEntries(
      Object.entries(input).map(([key, entry]) => [key, copy(entry, seen)]),
    );
  };

  return {
    text,
    value: (input) => copy(input, new WeakSet()),
    fields,
    extend: (extra) => createRedactor([...secrets, ...extra]),
  };
};
