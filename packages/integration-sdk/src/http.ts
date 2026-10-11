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

import { IntegrationError } from "./errors";
import type { Redactor } from "./redact";

/** The timeout of a request when nothing lowers it (ADR 0003). */
export const HTTP_TIMEOUT_MS = 10_000;

/** The ceiling of every request's timeout (ADR 0003). */
export const HTTP_TIMEOUT_MAX_MS = 30_000;

/** The most retries after the first attempt, for idempotent methods only. */
export const HTTP_RETRIES = 2;

/**
 * The longest `Retry-After` a retry waits for. A response asking for a longer
 * wait is returned to the caller instead, which decides whether to come back.
 */
export const HTTP_RETRY_AFTER_MAX_MS = 5_000;

const RETRY_BASE_MS = 200;
const RETRY_CAP_MS = 2_000;

const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "PUT",
  "DELETE",
]);
const RETRIED_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

/** The options of one request through `ctx.http`. */
export interface IntegrationHttpInit extends RequestInit {
  /** Lowers the integration's timeout for this request; it never raises it. */
  timeoutMs?: number;
  /**
   * Lowers the number of retries, at most {@link HTTP_RETRIES}. Ignored for
   * `POST` and `PATCH`, which are never retried.
   */
  retries?: number;
  /**
   * Values to redact for this request besides the declared secrets, such as a
   * per-request token in the URL path.
   */
  redact?: readonly string[];
}

/** `ctx.http`: the only way integration code makes an outbound request (INT-4). */
export interface IntegrationHttp {
  request(url: string | URL, init?: IntegrationHttpInit): Promise<Response>;
}

/** The `fetch` behind `ctx.http`: the global one, or a test's fake provider. */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/** One attempt, as reported to `onRequest`; the URL is already redacted. */
export interface HttpRequestEvent {
  integrationId: string;
  method: string;
  url: string;
  attempt: number;
  status: number | null;
  durationMs: number;
}

/**
 * The timeout of one request: the integration's limit, at most
 * {@link HTTP_TIMEOUT_MAX_MS}, lowered by the call's own value.
 */
export const resolveTimeoutMs = (
  integrationLimitMs: number,
  requestedMs?: number,
): number => {
  const limit = Math.min(integrationLimitMs, HTTP_TIMEOUT_MAX_MS);
  return Math.min(requestedMs ?? limit, limit);
};

interface HttpOptions {
  integrationId: string;
  redactor: Redactor;
  timeoutMs?: number;
  onRequest?: (event: HttpRequestEvent) => void;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<unknown>;
  random?: () => number;
}

/**
 * Builds `ctx.http` for one integration (ADR 0003).
 *
 * - The timeout ({@link resolveTimeoutMs}) covers the whole exchange: reading
 *   the body after it has run out rejects with a `TimeoutError`.
 * - Idempotent methods are retried after a network error, a timeout, or a 429,
 *   502, 503 or 504 response, with full-jitter backoff, or after the
 *   response's `Retry-After` when it asks for at most
 *   {@link HTTP_RETRY_AFTER_MAX_MS}. `POST` and `PATCH` are never retried,
 *   because a provider may have acted on a request whose answer was lost, and
 *   neither is a streamed body, which can only be sent once.
 * - Any other response is returned, whatever its status; the caller decides.
 * - A request that gets no response throws an {@link IntegrationError} coded
 *   `<id>.http_timeout`, `<id>.http_unreachable` or `<id>.http_aborted`,
 *   with the URL and the cause redacted.
 * - `onRequest` sees every attempt, with the URL redacted.
 */
export const createIntegrationHttp = (
  options: HttpOptions,
): IntegrationHttp => ({
  request: (url, init = {}) => sendWithRetries(options, url, init),
});

interface RequestPlan {
  init: RequestInit;
  signal: AbortSignal | null;
  method: string;
  timeout: number;
  attempts: number;
  shownUrl: string;
  redactor: Redactor;
}

const planRequest = (
  options: HttpOptions,
  url: string | URL,
  { timeoutMs, retries, redact = [], signal, ...init }: IntegrationHttpInit,
): RequestPlan => {
  const redactor =
    redact.length > 0 ? options.redactor.extend(redact) : options.redactor;
  const method = (init.method ?? "GET").toUpperCase();
  const retryable =
    IDEMPOTENT_METHODS.has(method) && !(init.body instanceof ReadableStream);
  return {
    init: { ...init, method },
    signal: signal ?? null,
    method,
    timeout: resolveTimeoutMs(options.timeoutMs ?? HTTP_TIMEOUT_MS, timeoutMs),
    attempts:
      1 + (retryable ? Math.min(retries ?? HTTP_RETRIES, HTTP_RETRIES) : 0),
    shownUrl: redactor.text(String(url)),
    redactor,
  };
};

const sendOnce = async (
  { integrationId, onRequest, fetch = globalThis.fetch }: HttpOptions,
  plan: RequestPlan,
  url: string | URL,
  attempt: number,
): Promise<{ response: Response } | { error: unknown }> => {
  const started = performance.now();
  const report = (status: number | null) =>
    onRequest?.({
      integrationId,
      method: plan.method,
      url: plan.shownUrl,
      attempt,
      status,
      durationMs: Math.round(performance.now() - started),
    });
  const timeoutSignal = AbortSignal.timeout(plan.timeout);
  try {
    const response = await fetch(url, {
      ...plan.init,
      signal: plan.signal
        ? AbortSignal.any([plan.signal, timeoutSignal])
        : timeoutSignal,
    });
    report(response.status);
    return { response };
  } catch (error) {
    report(null);
    return { error };
  }
};

const sendWithRetries = async (
  options: HttpOptions,
  url: string | URL,
  init: IntegrationHttpInit,
): Promise<Response> => {
  const { sleep = (ms: number) => Bun.sleep(ms), random = Math.random } =
    options;
  const plan = planRequest(options, url, init);
  const fail = (error: unknown) =>
    toIntegrationError(options.integrationId, plan, error);

  for (let attempt = 1; ; attempt++) {
    if (plan.signal?.aborted) throw fail(plan.signal.reason);
    const outcome = await sendOnce(options, plan, url, attempt);
    if ("error" in outcome) {
      if (plan.signal?.aborted || attempt >= plan.attempts) {
        throw fail(outcome.error);
      }
      await sleep(computeBackoffMs(attempt, random));
      continue;
    }
    const { response } = outcome;
    const next = decideAfterResponse({
      status: response.status,
      retryAfterMs: readRetryAfterMs(response.headers.get("retry-after")),
      attempt,
      attempts: plan.attempts,
    });
    if (next.kind === "return") return response;
    await response.body?.cancel();
    await sleep(next.delayMs ?? computeBackoffMs(attempt, random));
  }
};

/**
 * Whether a response ends the request or is retried, and after how long:
 * `delayMs` is the response's own `Retry-After`, or null for the backoff.
 */
export const decideAfterResponse = ({
  status,
  retryAfterMs,
  attempt,
  attempts,
}: {
  status: number;
  retryAfterMs: number | null;
  attempt: number;
  attempts: number;
}): { kind: "return" } | { kind: "retry"; delayMs: number | null } => {
  if (attempt >= attempts || !RETRIED_STATUSES.has(status)) {
    return { kind: "return" };
  }
  if (retryAfterMs !== null && retryAfterMs > HTTP_RETRY_AFTER_MAX_MS) {
    return { kind: "return" };
  }
  return { kind: "retry", delayMs: retryAfterMs };
};

/** Full jitter: a random delay up to the capped exponential step. */
const computeBackoffMs = (attempt: number, random: () => number) =>
  random() * Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (attempt - 1));

/** `Retry-After` in milliseconds, from seconds or an HTTP date; null when absent or unreadable. */
export const readRetryAfterMs = (
  header: string | null,
  now: () => number = Date.now,
): number | null => {
  if (header === null) return null;
  const seconds = Number(header);
  if (header.trim() !== "" && Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now());
};

const toIntegrationError = (
  integrationId: string,
  { method, shownUrl: url, timeout, signal, redactor }: RequestPlan,
  error: unknown,
) => {
  const cause = new Error(
    redactor.text(error instanceof Error ? error.message : String(error)),
  );
  if (signal?.aborted) {
    return new IntegrationError({
      code: `${integrationId}.http_aborted`,
      message: `${method} ${url} was aborted by the caller`,
      cause,
    });
  }
  const timedOut = error instanceof Error && error.name === "TimeoutError";
  return new IntegrationError({
    code: timedOut
      ? `${integrationId}.http_timeout`
      : `${integrationId}.http_unreachable`,
    message: timedOut
      ? `${method} ${url} got no response within ${timeout} ms`
      : `${method} ${url} failed: ${cause.message}`,
    retryable: true,
    params: { method, url },
    cause,
  });
};
