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

import type { DiscordClient } from "../../api";

export interface RecordedRequest {
  method: string;
  path: string;
  body?: unknown;
}

/**
 * A Discord client that answers from a table and records what was asked.
 *
 * Keyed by `METHOD /path`, so a test states the remote state it is simulating
 * in the same terms the reconciler asks for it.
 */
export const fakeClient = (
  responses: Record<string, unknown | (() => unknown)> = {},
) => {
  const requests: RecordedRequest[] = [];

  const client: DiscordClient = {
    appId: "app_1",
    request: async (method, path, body) => {
      requests.push({ method, path, body });

      const key = `${method} ${path}`;
      if (!Object.hasOwn(responses, key)) return undefined as never;

      const answer = responses[key];
      const value = typeof answer === "function" ? answer() : answer;
      if (value instanceof Error) throw value;
      return value as never;
    },
  };

  return {
    client,
    requests,
    /** Only the calls that wrote something. */
    writes: () => requests.filter((request) => request.method !== "GET"),
  };
};
