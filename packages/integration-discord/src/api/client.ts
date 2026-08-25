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

import type { IntegrationLogger } from "@virtbase/integration-sdk";

const API_BASE = "https://discord.com/api/v10";

/** A non-2xx answer from Discord, with the body kept for the health message. */
export class DiscordApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(method: string, path: string, status: number, body: string) {
    super(
      `Discord API ${method} ${path} returned ${status}${body ? `: ${body}` : ""}`,
    );
    this.name = "DiscordApiError";
    this.status = status;
    this.body = body;
  }
}

export interface DiscordClientOptions {
  appId: string;
  botToken: string;
  logger?: IntegrationLogger;
  /** Swapped for a stub in tests. */
  fetch?: typeof globalThis.fetch;
}

export interface DiscordClient {
  readonly appId: string;
  request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T>;
}

/**
 * The only thing in this package that talks HTTP to Discord.
 *
 * Credentials arrive as arguments rather than from `process.env`: they live in
 * `integration_secrets`, and the context the registry builds is the one place
 * they are decrypted.
 *
 * A 429 is retried once after the `Retry-After` Discord names. Once, not until
 * it succeeds — this runs inside an interaction with a three-second budget and
 * inside a health probe that must return, so an unbounded backoff would turn a
 * rate limit into a hang.
 */
export const createDiscordClient = ({
  appId,
  botToken,
  logger,
  fetch: fetchImpl = globalThis.fetch,
}: DiscordClientOptions): DiscordClient => {
  const request = async <T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    isRetry = false,
  ): Promise<T> => {
    const response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${botToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (response.status === 429 && !isRetry) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      const waitMs =
        Math.min(Number.isFinite(retryAfter) ? retryAfter : 1, 5) * 1000;

      logger?.warn(`[discord] Rate limited on ${method} ${path}`, { waitMs });
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      return request<T>(method, path, body, true);
    }

    if (!response.ok) {
      throw new DiscordApiError(
        method,
        path,
        response.status,
        await response.text().catch(() => ""),
      );
    }

    // 204 No Content is the normal answer to a DELETE.
    if (response.status === 204) return undefined as T;

    return (await response.json()) as T;
  };

  return {
    appId,
    request: (method, path, body) => request(method, path, body),
  };
};
