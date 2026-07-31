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

import { lookup as defaultDnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import * as Sentry from "@sentry/node";

const MAX_REDIRECT_HOPS = 3;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
] as const;

const blockedAddresses = createBlockedAddressList();

export class UnsafeIsoDownloadUrlError extends Error {
  constructor(message = "Unsafe ISO download URL") {
    super(message);
    this.name = "UnsafeIsoDownloadUrlError";
  }
}

export type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim?: boolean },
) => Promise<Array<{ address: string; family: number }>>;

const resolveAllAddresses: DnsLookup = async (hostname, options) => {
  return defaultDnsLookup(hostname, options);
};

export type AssertSafeIsoDownloadUrlOptions = {
  /**
   * When true (default), the URL path must end with `.iso`.
   * Redirect hops often lose the suffix (CDN signed URLs), so those skip it.
   */
  requireIsoSuffix?: boolean;
  lookup?: DnsLookup;
};

/**
 * Validate that a user-supplied ISO download URL is safe to fetch
 * (SSRF hardening: https-only, no credentials, domain host, public DNS).
 */
export async function assertSafeIsoDownloadUrl(
  rawUrl: string,
  options: AssertSafeIsoDownloadUrlOptions = {},
): Promise<URL> {
  const { requireIsoSuffix = true, lookup = resolveAllAddresses } = options;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeIsoDownloadUrlError("Invalid URL");
  }

  if (url.protocol !== "https:") {
    throw new UnsafeIsoDownloadUrlError("URL must use https");
  }

  if (url.username || url.password) {
    throw new UnsafeIsoDownloadUrlError("URL must not include credentials");
  }

  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!hostname) {
    throw new UnsafeIsoDownloadUrlError("URL hostname is required");
  }

  if (isIP(hostname) !== 0) {
    throw new UnsafeIsoDownloadUrlError("URL hostname must be a domain name");
  }

  if (isBlockedHostname(hostname)) {
    throw new UnsafeIsoDownloadUrlError("URL hostname is not allowed");
  }

  if (requireIsoSuffix && !url.pathname.toLowerCase().endsWith(".iso")) {
    throw new UnsafeIsoDownloadUrlError("URL path must end with .iso");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new UnsafeIsoDownloadUrlError("URL hostname could not be resolved");
  }

  for (const { address } of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new UnsafeIsoDownloadUrlError(
        "URL hostname resolves to a blocked address",
      );
    }
  }

  return url;
}

/**
 * HEAD-request the ISO URL without following redirects automatically.
 * Each redirect hop is re-validated against the SSRF checks.
 */
export async function getSafeIsoDownloadSizeBytes(
  rawUrl: string,
  options: Pick<AssertSafeIsoDownloadUrlOptions, "lookup"> = {},
): Promise<number> {
  let currentUrl = rawUrl;

  try {
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      await assertSafeIsoDownloadUrl(currentUrl, {
        // Only the original URL is required to end with `.iso`.
        requireIsoSuffix: hop === 0,
        lookup: options.lookup,
      });

      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return 0;
        }

        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      if (!response.ok) {
        return 0;
      }

      const contentLength = response.headers.get("content-length");
      if (!contentLength) {
        return 0;
      }

      const size = Number.parseInt(contentLength, 10);
      return Number.isFinite(size) ? size : 0;
    }

    return 0;
  } catch (error) {
    if (error instanceof UnsafeIsoDownloadUrlError) {
      throw error;
    }

    Sentry.captureException(error);
    return 0;
  }
}

function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return true;
  }

  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function createBlockedAddressList(): BlockList {
  const list = new BlockList();

  // IPv4 special-use / private ranges
  list.addSubnet("0.0.0.0", 8, "ipv4");
  list.addSubnet("10.0.0.0", 8, "ipv4");
  list.addSubnet("127.0.0.0", 8, "ipv4");
  list.addSubnet("169.254.0.0", 16, "ipv4");
  list.addSubnet("172.16.0.0", 12, "ipv4");
  list.addSubnet("192.168.0.0", 16, "ipv4");
  list.addSubnet("100.64.0.0", 10, "ipv4");
  list.addSubnet("192.0.0.0", 24, "ipv4");
  list.addSubnet("192.0.2.0", 24, "ipv4");
  list.addSubnet("198.18.0.0", 15, "ipv4");
  list.addSubnet("198.51.100.0", 24, "ipv4");
  list.addSubnet("203.0.113.0", 24, "ipv4");
  list.addSubnet("224.0.0.0", 4, "ipv4");
  list.addSubnet("240.0.0.0", 4, "ipv4");
  list.addAddress("255.255.255.255", "ipv4");

  // IPv6 special-use / private ranges
  list.addAddress("::", "ipv6");
  list.addAddress("::1", "ipv6");
  list.addSubnet("fc00::", 7, "ipv6");
  list.addSubnet("fe80::", 10, "ipv6");
  list.addSubnet("ff00::", 8, "ipv6");
  list.addSubnet("2001:db8::", 32, "ipv6");

  return list;
}

function tryUnwrapIpv4Mapped(address: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted?.[1]) {
    return dotted[1];
  }

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex?.[1] || !hex[2]) {
    return null;
  }

  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isBlockedIpAddress(address: string): boolean {
  const unwrapped = tryUnwrapIpv4Mapped(address);
  const candidate = unwrapped ?? address;
  const version = isIP(candidate);

  if (version === 0) {
    return true;
  }

  return blockedAddresses.check(candidate, version === 4 ? "ipv4" : "ipv6");
}
