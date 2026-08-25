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

import type { DnsLookup } from "../lib/safe-iso-download-url";
import {
  assertSafeIsoDownloadUrl,
  UnsafeIsoDownloadUrlError,
} from "../lib/safe-iso-download-url";

/**
 * Validates a template image URL before it is handed to a Proxmox node.
 *
 * A template image URL is entered by an administrator rather than a customer,
 * but it is still a URL that a host on the management network will fetch, so it
 * gets the same SSRF treatment as a customer-supplied ISO: https only, no
 * credentials, a domain name rather than a literal address, and no resolution
 * to a private or link-local range.
 *
 * Delegates to the ISO validator rather than duplicating it - only the
 * extension rule differs, because an image is not an `.iso` and Ubuntu even
 * publishes qcow2 content under `.img`. Proxmox validates the *stored*
 * filename's extension, which `deriveTemplateImageFilename` controls, so
 * nothing is lost by not constraining the source URL's.
 */
export async function assertSafeImageUrl(
  rawUrl: string,
  options: { lookup?: DnsLookup } = {},
): Promise<URL> {
  return assertSafeIsoDownloadUrl(rawUrl, {
    ...options,
    requireIsoSuffix: false,
  });
}

export { UnsafeIsoDownloadUrlError as UnsafeImageUrlError };
