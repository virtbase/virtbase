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

import type { PointerRecord } from "@virtbase/integration-testing/ports/dns";
import * as z from "zod";

const ZONE_PATH = /^\/api\/v1\/servers\/localhost\/zones\/([^/]+)$/;

const PatchSchema = z.object({
  rrsets: z.array(
    z.object({
      name: z.string(),
      type: z.literal("PTR"),
      changetype: z.enum(["REPLACE", "DELETE"]),
      records: z.array(z.object({ content: z.string() })).optional(),
    }),
  ),
});

/**
 * A fake PowerDNS HTTP API as a `fetch`: `GET /api/v1/servers/localhost` and
 * `PATCH .../zones/<zone>` with PTR rrsets, behind the `X-API-Key` header.
 * Zones exist on first use. `failWith` makes every request answer that
 * status.
 */
export const createFakePowerDns = (apiKey: string) => {
  const zones = new Map<string, Map<string, string>>();
  let failure: number | null = null;
  const zone = (name: string) => {
    const key = name.replace(/\.$/, "");
    const records = zones.get(key) ?? new Map<string, string>();
    zones.set(key, records);
    return records;
  };

  const patchZone = (name: string, body: unknown) => {
    const records = zone(name);
    for (const rrset of PatchSchema.parse(body).rrsets) {
      const recordName = rrset.name.replace(/\.$/, "");
      if (rrset.changetype === "DELETE") records.delete(recordName);
      else records.set(recordName, rrset.records?.[0]?.content ?? "");
    }
    return new Response(null, { status: 204 });
  };

  const route = (pathname: string, init?: RequestInit) => {
    if (pathname === "/api/v1/servers/localhost" && init?.method === "GET") {
      return Response.json({ id: "localhost", version: "4.9.0" });
    }
    const match = ZONE_PATH.exec(pathname);
    if (match?.[1] && init?.method === "PATCH") {
      return patchZone(
        decodeURIComponent(match[1]),
        JSON.parse(String(init.body)),
      );
    }
    return new Response("Not Found", { status: 404, statusText: "Not Found" });
  };

  const fetch = async (input: string | URL, init?: RequestInit) => {
    if (failure !== null) return new Response("failure", { status: failure });
    if (new Headers(init?.headers).get("x-api-key") !== apiKey) {
      return new Response("Unauthorized", {
        status: 401,
        statusText: "Unauthorized",
      });
    }
    return route(new URL(String(input)).pathname, init);
  };

  return {
    fetch,
    records: async (name: string): Promise<PointerRecord[]> =>
      [...zone(name)].map(([recordName, content]) => ({
        name: recordName,
        content,
      })),
    failWith: (status: number | null) => {
      failure = status;
    },
  };
};
