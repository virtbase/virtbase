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

import {
  ADMIN_HOSTNAMES,
  APP_HOSTNAMES,
  PUBLIC_HOSTNAMES,
} from "../constants/main";

const TRUSTED_REDIRECT_HOSTNAMES = new Set(
  [...PUBLIC_HOSTNAMES, ...APP_HOSTNAMES, ...ADMIN_HOSTNAMES].filter(
    (hostname): hostname is string => Boolean(hostname),
  ),
);

function isSafeRelativeRedirectPath(path: string): boolean {
  // Path-absolute only. Reject protocol-relative (`//evil`) and backslash tricks
  // that some browsers normalize into `//`.
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }
  if (path.includes("\\") || path.includes("\0")) {
    return false;
  }
  return true;
}

function isTrustedRedirectHost(host: string): boolean {
  return TRUSTED_REDIRECT_HOSTNAMES.has(host);
}

/**
 * Sanitize a post-auth redirect target (`next` / `callbackURL`).
 *
 * Allows:
 * - relative paths that start with `/` but not `//`
 * - absolute http(s) URLs whose host is a trusted Virtbase APP/ADMIN/PUBLIC host
 *
 * Everything else falls back to `fallback` (default `/`).
 */
export function getSafeRedirectUrl(
  candidate: string | null | undefined,
  fallback = "/",
): string {
  if (candidate == null) {
    return fallback;
  }

  const value = candidate.trim();
  if (!value) {
    return fallback;
  }

  if (isSafeRelativeRedirectPath(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }

    // Prefer `host` (includes port) to match local hostname sets with `:3000`.
    if (
      !isTrustedRedirectHost(url.host) &&
      !isTrustedRedirectHost(url.hostname)
    ) {
      return fallback;
    }

    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
