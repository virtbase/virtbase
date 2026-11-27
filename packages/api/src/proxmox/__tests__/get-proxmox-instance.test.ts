/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  getProxmoxInstance,
  parseNodeEndpoint,
} from "../get-proxmox-instance.ts";

const TOKEN = {
  tokenID: "api@pve!virtbase",
  tokenSecret: "f7d62f02-eb10-413e-b8f1-6dd8a9902885",
};

/** Records every request the client sends and answers each with `data`. */
const captureFetch = (data: unknown = null) => {
  const requests: Request[] = [];
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push(new Request(input, init));
    return Response.json({ data });
  }) as typeof fetch);

  return { requests, spy };
};

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe("parseNodeEndpoint", () => {
  test("it puts a bare name on 443, where production nodes are", () => {
    expect(parseNodeEndpoint("epyc01.example.com")).toEqual({
      host: "epyc01.example.com",
      port: 443,
    });
  });

  test("it keeps an explicit port, as the local cluster stores one", () => {
    expect(parseNodeEndpoint("127.0.0.1:19001")).toEqual({
      host: "127.0.0.1",
      port: 19001,
    });
  });

  test("it keeps an IPv6 literal in brackets", () => {
    expect(parseNodeEndpoint("[2001:db8::1]:8006")).toEqual({
      host: "[2001:db8::1]",
      port: 8006,
    });
  });
});

describe("getProxmoxInstance", () => {
  test("it sends API requests to 443 when fqdn names no port", async () => {
    const { requests, spy } = captureFetch([]);
    restore = () => spy.mockRestore();

    const { node } = getProxmoxInstance({
      hostname: "epyc01",
      fqdn: "epyc01.example.com",
      ...TOKEN,
    });
    await node.qemu.$get();

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]?.url ?? "");
    // 443 is the scheme default, so `URL` leaves it out of `host`.
    expect(url.host).toBe("epyc01.example.com");
    expect(url.pathname).toBe("/api2/json/nodes/epyc01/qemu");
  });

  test("it sends API requests to the port in fqdn", async () => {
    const { requests, spy } = captureFetch([]);
    restore = () => spy.mockRestore();

    const { node } = getProxmoxInstance({
      hostname: "pve1",
      fqdn: "127.0.0.1:19001",
      ...TOKEN,
    });
    await node.qemu.$get();

    expect(new URL(requests[0]?.url ?? "").host).toBe("127.0.0.1:19001");
  });

  test("it exposes the token as an Authorization header value", () => {
    const { authorization } = getProxmoxInstance({
      hostname: "pve1",
      fqdn: "epyc01.example.com",
      ...TOKEN,
    });

    expect(authorization).toBe(
      `PVEAPIToken=${TOKEN.tokenID}=${TOKEN.tokenSecret}`,
    );
  });

  test("it uploads a snippet to the same endpoint with the token", async () => {
    const { requests, spy } = captureFetch();
    restore = () => spy.mockRestore();

    const { uploadSnippet } = getProxmoxInstance({
      hostname: "pve1",
      fqdn: "127.0.0.1:19001",
      ...TOKEN,
    });
    await uploadSnippet({
      filename: "user-data.yaml",
      storage: "cephfs",
      contents: "#cloud-config\n",
    });

    expect(requests).toHaveLength(1);
    const [request] = requests;
    const url = new URL(request?.url ?? "");
    expect(url.host).toBe("127.0.0.1:19001");
    expect(url.pathname).toBe("/api2/json/nodes/pve1/storage/cephfs/upload");
    expect(url.searchParams.get("content")).toBe("snippets");
    expect(request?.headers.get("authorization")).toBe(
      `PVEAPIToken=${TOKEN.tokenID}=${TOKEN.tokenSecret}`,
    );
  });
});
