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

import { afterEach, describe, expect, mock, test } from "bun:test";
import type { DnsLookup } from "../safe-iso-download-url";
import {
  assertSafeIsoDownloadUrl,
  getSafeIsoDownloadSizeBytes,
  isBlockedIpAddress,
  UnsafeIsoDownloadUrlError,
} from "../safe-iso-download-url";

const publicLookup: DnsLookup = async () => [
  { address: "93.184.216.34", family: 4 },
];

const privateLookup: DnsLookup = async () => [
  { address: "10.0.0.5", family: 4 },
];

const mixedLookup: DnsLookup = async () => [
  { address: "93.184.216.34", family: 4 },
  { address: "192.168.1.10", family: 4 },
];

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("isBlockedIpAddress", () => {
  test("blocks private, loopback, link-local and metadata ranges", () => {
    expect(isBlockedIpAddress("10.1.2.3")).toBe(true);
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("172.16.0.1")).toBe(true);
    expect(isBlockedIpAddress("192.168.0.1")).toBe(true);
    expect(isBlockedIpAddress("100.64.0.1")).toBe(true);
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fc00::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.0.0.1")).toBe(true);
  });

  test("allows public unicast addresses", () => {
    expect(isBlockedIpAddress("93.184.216.34")).toBe(false);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("2001:4860:4860::8888")).toBe(false);
  });
});

describe("assertSafeIsoDownloadUrl", () => {
  test("allows a public https ISO URL", async () => {
    const url = await assertSafeIsoDownloadUrl(
      "https://example.com/debian-12-amd64.iso",
      { lookup: publicLookup },
    );
    expect(url.href).toBe("https://example.com/debian-12-amd64.iso");
  });

  test("rejects non-https URLs", async () => {
    await expect(
      assertSafeIsoDownloadUrl("http://example.com/debian.iso", {
        lookup: publicLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);
  });

  test("rejects URLs with credentials", async () => {
    await expect(
      assertSafeIsoDownloadUrl("https://user:pass@example.com/debian.iso", {
        lookup: publicLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);
  });

  test("rejects IP-literal hosts", async () => {
    await expect(
      assertSafeIsoDownloadUrl("https://8.8.8.8/debian.iso", {
        lookup: publicLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);
  });

  test("rejects blocked hostnames without DNS", async () => {
    await expect(
      assertSafeIsoDownloadUrl("https://localhost/debian.iso", {
        lookup: publicLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);

    await expect(
      assertSafeIsoDownloadUrl("https://foo.internal/debian.iso", {
        lookup: publicLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);

    await expect(
      assertSafeIsoDownloadUrl("https://metadata.google.internal/debian.iso", {
        lookup: publicLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);
  });

  test("rejects hosts that resolve to private addresses", async () => {
    await expect(
      assertSafeIsoDownloadUrl("https://evil.example/debian.iso", {
        lookup: privateLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);
  });

  test("rejects when any resolved address is blocked", async () => {
    await expect(
      assertSafeIsoDownloadUrl("https://mixed.example/debian.iso", {
        lookup: mixedLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);
  });

  test("rejects non-.iso paths by default", async () => {
    await expect(
      assertSafeIsoDownloadUrl("https://example.com/debian.bin", {
        lookup: publicLookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);
  });
});

describe("getSafeIsoDownloadSizeBytes", () => {
  test("returns content-length for a safe URL", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { "content-length": "12345" },
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      getSafeIsoDownloadSizeBytes("https://example.com/debian.iso", {
        lookup: publicLookup,
      }),
    ).resolves.toBe(12345);
  });

  test("follows a redirect to a public host and returns size", async () => {
    const lookup: DnsLookup = async (hostname) => {
      if (hostname === "cdn.example") {
        return [{ address: "1.2.3.4", family: 4 }];
      }
      return [{ address: "93.184.216.34", family: 4 }];
    };

    globalThis.fetch = mock((input: string | URL | Request) => {
      const href = String(input);
      if (href === "https://example.com/debian.iso") {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://cdn.example/file.bin" },
          }),
        );
      }

      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { "content-length": "999" },
        }),
      );
    }) as unknown as typeof fetch;

    await expect(
      getSafeIsoDownloadSizeBytes("https://example.com/debian.iso", {
        lookup,
      }),
    ).resolves.toBe(999);
  });

  test("rejects a redirect to a private host", async () => {
    const lookup: DnsLookup = async (hostname) => {
      if (hostname === "internal.example") {
        return [{ address: "10.0.0.8", family: 4 }];
      }
      return [{ address: "93.184.216.34", family: 4 }];
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://internal.example/secret.iso" },
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      getSafeIsoDownloadSizeBytes("https://example.com/debian.iso", {
        lookup,
      }),
    ).rejects.toBeInstanceOf(UnsafeIsoDownloadUrlError);
  });
});
