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

import { TEMPLATE_IMAGE_REFRESH_DAYS } from "../constants/limits";

/**
 * The file extensions Proxmox accepts as `import` content, from
 * `$IMPORT_EXT_RE_1` in `PVE/Storage.pm`.
 *
 * Notably absent: `.img`. Ubuntu publishes its cloud images under that name
 * even though they are qcow2 inside, so the stored file has to be *named*
 * `.qcow2` or Proxmox refuses to list it as an importable volume.
 */
export const IMPORT_IMAGE_EXTENSIONS = [
  "qcow2",
  "raw",
  "vmdk",
  "ova",
  "ovf",
] as const;

export type ImportImageExtension = (typeof IMPORT_IMAGE_EXTENSIONS)[number];

/**
 * Characters Proxmox allows in a stored filename, from `$SAFE_CHAR_CLASS_RE`.
 * Proxmox normalises anything else, so a generated name has to be legal up
 * front or the volid we record will not be the one that exists.
 */
const SAFE_FILENAME_CHARACTER = /[^a-zA-Z0-9\-.+=_]/g;

/**
 * Compression formats `download-url` can unpack on the node. Anything else has
 * to be handled before the URL reaches Proxmox.
 */
const COMPRESSION_EXTENSIONS = new Set(["zst", "gz", "lzo", "bz2", "xz"]);

/**
 * Picks the extension the *stored* file must carry.
 *
 * Driven by the source URL, but only as a hint: an extension Proxmox does not
 * accept as import content (`.img`) falls back to `qcow2`, which is what those
 * files actually are. A compression suffix is stripped first, because
 * `download-url` decompresses before the name is checked.
 */
export function resolveImportImageExtension(url: string): ImportImageExtension {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  const segments = pathname.toLowerCase().split(".");

  // Drop a trailing compression suffix: `foo.qcow2.zst` is stored as `foo.qcow2`
  if (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (last && COMPRESSION_EXTENSIONS.has(last)) segments.pop();
  }

  const extension = segments[segments.length - 1];

  return IMPORT_IMAGE_EXTENSIONS.includes(extension as ImportImageExtension)
    ? (extension as ImportImageExtension)
    : "qcow2";
}

/**
 * Reads the compression format `download-url` should unpack, or `null` when the
 * URL does not name one.
 */
export function resolveImageCompression(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  const extension = pathname.toLowerCase().split(".").pop();

  return extension && COMPRESSION_EXTENSIONS.has(extension) ? extension : null;
}

export interface DeriveTemplateImageFilenameParams {
  templateId: string;
  imageUrl: string;
  /** The template's expected checksum, when it has one. */
  checksum?: string | null;
  /** Injectable for tests. */
  now?: Date;
}

/**
 * Builds the filename a template's image is stored under.
 *
 * Content-addressed where possible: the name carries a slice of the checksum,
 * so a template whose image is repointed downloads to a *different* file and
 * the old one can be removed only once the new row has settled. Nothing is ever
 * overwritten underneath a guest that is importing from it.
 *
 * Without a checksum - a `-latest-` alias, which the vendor repoints in place -
 * there is nothing to address by, so the name is dated instead. That refreshes
 * at most once a day, which is the best available without a digest to compare.
 */
export function deriveTemplateImageFilename({
  templateId,
  imageUrl,
  checksum,
  now = new Date(),
}: DeriveTemplateImageFilenameParams): string {
  const extension = resolveImportImageExtension(imageUrl);

  const discriminator = checksum
    ? checksum.slice(0, 12).toLowerCase()
    : // YYYYMMDD in UTC - node-local time would make the name depend on which
      // node happened to run the download.
      now.toISOString().slice(0, 10).replaceAll("-", "");

  return (
    `${templateId}-${discriminator}`.replace(SAFE_FILENAME_CHARACTER, "_") +
    `.${extension}`
  );
}

export interface IsTemplateImageFreshParams {
  downloadedAt: Date | null;
  /** The template's override, or null to use the global default. */
  refreshDays?: number | null;
  /** The checksum the image was downloaded with. */
  storedChecksum?: string | null;
  /** The checksum the template currently expects. */
  expectedChecksum?: string | null;
  now?: Date;
}

/**
 * Whether a downloaded image may still be used as-is.
 *
 * A checksum change always wins over the age window: the operator repointed the
 * template at different bytes, and serving the old ones would be wrong however
 * recently they were fetched.
 */
export function isTemplateImageFresh({
  downloadedAt,
  refreshDays,
  storedChecksum,
  expectedChecksum,
  now = new Date(),
}: IsTemplateImageFreshParams): boolean {
  if (!downloadedAt) return false;

  // Normalise: null and undefined both mean "no checksum pinned".
  if ((storedChecksum ?? null) !== (expectedChecksum ?? null)) return false;

  const days = refreshDays ?? TEMPLATE_IMAGE_REFRESH_DAYS;

  // A non-positive window means "never expire on age alone".
  if (days <= 0) return true;

  const ageMs = now.getTime() - downloadedAt.getTime();

  return ageMs < days * 24 * 60 * 60 * 1000;
}
