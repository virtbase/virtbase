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
import {
  createIntegrationHttp,
  createRedactor,
  IntegrationError,
  IntegrationRegistry,
} from "@virtbase/integration-sdk";
import { describeDnsProvider } from "@virtbase/integration-testing/ports/dns";
import { PortError } from "@virtbase/ports";
import { PowerDnsAdapter } from "../adapter";
import { PowerDNSClient, toZoneId } from "../client";
import powerdns from "../index";
import { createFakePowerDns } from "./fake-powerdns";

const API_KEY = "powerdns-adapter-key";

const adapterOn = (
  fake: ReturnType<typeof createFakePowerDns>,
  apiKey = API_KEY,
) =>
  new PowerDnsAdapter(
    new PowerDNSClient({
      apiUrl: "https://ns1.powerdns.test:8081",
      apiKey,
      http: createIntegrationHttp({
        integrationId: "powerdns",
        redactor: createRedactor([apiKey]),
        fetch: fake.fetch,
        sleep: async () => {},
      }),
    }),
  );

describeDnsProvider("PowerDNS", async () => {
  const fake = createFakePowerDns(API_KEY);
  return { provider: adapterOn(fake), records: fake.records };
});

const failure = async (run: () => Promise<void>) => {
  const error = await run().then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof PortError)) throw new Error("expected a PortError");
  return error;
};

describe("PowerDnsAdapter failures", () => {
  test("a 5xx from PowerDNS is a retryable PortError", async () => {
    const fake = createFakePowerDns(API_KEY);
    fake.failWith(503);

    const error = await failure(() =>
      adapterOn(fake).upsertPointerRecord({
        zone: "2.0.10.in-addr.arpa",
        ip: "10.0.2.7",
        hostname: "host.example",
      }),
    );

    expect(error.retryable).toBe(true);
    expect(error.cause).toMatchObject({ code: "powerdns.request_failed" });
  });

  test("a rejected API key is not retryable", async () => {
    const error = await failure(() =>
      adapterOn(
        createFakePowerDns(API_KEY),
        "wrong-key-1",
      ).deletePointerRecords({
        zone: "2.0.10.in-addr.arpa",
        ips: ["10.0.2.7"],
      }),
    );

    expect(error.retryable).toBe(false);
    expect(error.cause).toMatchObject({
      code: "powerdns.request_failed",
      params: { status: 401 },
    });
  });

  test("an IP outside the zone is a non-retryable zone mismatch", async () => {
    const error = await failure(() =>
      adapterOn(createFakePowerDns(API_KEY)).upsertPointerRecord({
        zone: "2.0.10.in-addr.arpa",
        ip: "10.9.9.9",
        hostname: "host.example",
      }),
    );

    expect(error.retryable).toBe(false);
    expect(error.cause).toBeInstanceOf(IntegrationError);
    expect(error.cause).toMatchObject({ code: "powerdns.zone_mismatch" });
  });

  test("deleting no IPs sends nothing", async () => {
    const fake = createFakePowerDns(API_KEY);
    fake.failWith(500);

    await adapterOn(fake).deletePointerRecords({
      zone: "2.0.10.in-addr.arpa",
      ips: [],
    });
  });

  test("a 429 from PowerDNS is retryable", async () => {
    const fake = createFakePowerDns(API_KEY);
    fake.failWith(429);

    const error = await failure(() =>
      adapterOn(fake).deletePointerRecords({
        zone: "2.0.10.in-addr.arpa",
        ips: ["10.0.2.7"],
      }),
    );

    expect(error.retryable).toBe(true);
  });
});

describe("PowerDNSClient", () => {
  test("escapes an RFC 2317 zone into PowerDNS's zone id", () => {
    expect(toZoneId("0/25.1.168.192.in-addr.arpa.")).toBe(
      "0=2F25.1.168.192.in-addr.arpa.",
    );
  });

  test("writes a record into an RFC 2317 zone", async () => {
    const fake = createFakePowerDns(API_KEY);

    await adapterOn(fake).upsertPointerRecord({
      zone: "0/25.1.168.192.in-addr.arpa",
      ip: "192.168.1.5",
      hostname: "host.example",
    });

    expect(await fake.records("0/25.1.168.192.in-addr.arpa")).toEqual([
      { name: "5.0/25.1.168.192.in-addr.arpa", content: "host.example." },
    ]);
  });

  test("reports a server-info body that is not PowerDNS's as unexpected", async () => {
    const fake = createFakePowerDns(API_KEY);
    fake.answerServerInfo({ status: "ok" });
    const client = new PowerDNSClient({
      apiUrl: "https://ns1.powerdns.test:8081",
      apiKey: API_KEY,
      http: createIntegrationHttp({
        integrationId: "powerdns",
        redactor: createRedactor([API_KEY]),
        fetch: fake.fetch,
      }),
    });

    await expect(client.getServerInfo()).rejects.toMatchObject({
      code: "powerdns.unexpected_response",
    });
  });
});

describe("the dns factory", () => {
  test("builds an adapter on the stored configuration", async () => {
    const fake = createFakePowerDns(API_KEY);
    const registry = new IntegrationRegistry({
      integrations: [powerdns],
      config: {
        isEnabled: async () => true,
        settings: async () => ({ apiUrl: "https://ns1.powerdns.test:8081" }),
        secrets: async () => ({ apiKey: API_KEY }),
      },
      fetch: fake.fetch,
    });

    const dns = await registry.require("dns");
    await dns.upsertPointerRecord({
      zone: "2.0.10.in-addr.arpa",
      ip: "10.0.2.7",
      hostname: "host.example",
    });

    expect(await fake.records("2.0.10.in-addr.arpa")).toEqual([
      { name: "7.2.0.10.in-addr.arpa", content: "host.example." },
    ]);
  });
});
