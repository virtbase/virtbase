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
import { TEMPLATE_IMAGE_REFRESH_DAYS } from "../../constants/limits";
import {
  deriveTemplateImageFilename,
  isTemplateImageFresh,
  resolveImageCompression,
  resolveImportImageExtension,
} from "../template-image";

const TEMPLATE_ID = "temp_1KDR24RNF2WY69G0FG7YHDQ6T";
const CHECKSUM =
  "ae204682c015fd026838b71f1ce82585368dbb8c050b779ffd8a21a90a6c94f2";

describe("resolveImportImageExtension", () => {
  test("keeps an extension Proxmox accepts as import content", () => {
    expect(
      resolveImportImageExtension(
        "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2",
      ),
    ).toBe("qcow2");
    expect(resolveImportImageExtension("https://example.com/disk.raw")).toBe(
      "raw",
    );
    expect(
      resolveImportImageExtension("https://example.com/appliance.ova"),
    ).toBe("ova");
  });

  test("rewrites .img to qcow2", () => {
    // Ubuntu publishes qcow2 content under `.img`, and Proxmox's
    // $IMPORT_EXT_RE_1 rejects that extension outright.
    expect(
      resolveImportImageExtension(
        "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img",
      ),
    ).toBe("qcow2");
  });

  test("strips a compression suffix before deciding", () => {
    expect(
      resolveImportImageExtension("https://example.com/freebsd-15.qcow2.zst"),
    ).toBe("qcow2");
    expect(resolveImportImageExtension("https://example.com/disk.raw.gz")).toBe(
      "raw",
    );
  });

  test("falls back to qcow2 for an unknown or absent extension", () => {
    expect(resolveImportImageExtension("https://example.com/download")).toBe(
      "qcow2",
    );
    expect(resolveImportImageExtension("https://example.com/image.bin")).toBe(
      "qcow2",
    );
  });

  test("ignores a query string", () => {
    expect(
      resolveImportImageExtension("https://example.com/disk.raw?token=abc"),
    ).toBe("raw");
  });
});

describe("resolveImageCompression", () => {
  test("detects a compression suffix", () => {
    expect(resolveImageCompression("https://example.com/a.qcow2.zst")).toBe(
      "zst",
    );
    expect(resolveImageCompression("https://example.com/a.raw.gz")).toBe("gz");
  });

  test("is null for an uncompressed image", () => {
    expect(resolveImageCompression("https://example.com/a.qcow2")).toBeNull();
  });
});

describe("deriveTemplateImageFilename", () => {
  test("is content-addressed when a checksum is pinned", () => {
    const name = deriveTemplateImageFilename({
      templateId: TEMPLATE_ID,
      imageUrl: "https://example.com/debian-13.qcow2",
      checksum: CHECKSUM,
    });

    expect(name).toBe(`${TEMPLATE_ID}-ae204682c015.qcow2`);
  });

  test("a changed checksum yields a different file", () => {
    const params = {
      templateId: TEMPLATE_ID,
      imageUrl: "https://example.com/debian-13.qcow2",
    };

    // This is what keeps a refresh from overwriting a volume that a guest may
    // still be importing from.
    expect(
      deriveTemplateImageFilename({ ...params, checksum: CHECKSUM }),
    ).not.toBe(
      deriveTemplateImageFilename({ ...params, checksum: `ff${CHECKSUM}` }),
    );
  });

  test("falls back to a UTC date when no checksum is pinned", () => {
    const name = deriveTemplateImageFilename({
      templateId: TEMPLATE_ID,
      imageUrl: "https://example.com/debian-13.qcow2",
      checksum: null,
      now: new Date("2026-08-25T23:30:00Z"),
    });

    expect(name).toBe(`${TEMPLATE_ID}-20260825.qcow2`);
  });

  test("the date is UTC, not node-local", () => {
    // Same instant, and the name must not depend on which node ran it.
    const at = new Date("2026-08-25T23:30:00Z");
    expect(
      deriveTemplateImageFilename({
        templateId: TEMPLATE_ID,
        imageUrl: "https://example.com/a.qcow2",
        now: at,
      }),
    ).toContain("-20260825.");
  });

  test("produces only characters Proxmox will not normalise", () => {
    const name = deriveTemplateImageFilename({
      templateId: "temp_with/slash and space",
      imageUrl: "https://example.com/a.img",
      checksum: null,
      now: new Date("2026-01-02T00:00:00Z"),
    });

    // $SAFE_CHAR_CLASS_RE = [a-zA-Z0-9\-\.\+\=\_]
    expect(name).toMatch(/^[a-zA-Z0-9\-.+=_]+$/);
    expect(name.endsWith(".qcow2")).toBe(true);
  });
});

describe("isTemplateImageFresh", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  test("a never-downloaded image is not fresh", () => {
    expect(isTemplateImageFresh({ downloadedAt: null, now })).toBe(false);
  });

  test("uses the global default when the template has no override", () => {
    expect(
      isTemplateImageFresh({
        downloadedAt: daysAgo(TEMPLATE_IMAGE_REFRESH_DAYS - 1),
        now,
      }),
    ).toBe(true);
    expect(
      isTemplateImageFresh({
        downloadedAt: daysAgo(TEMPLATE_IMAGE_REFRESH_DAYS + 1),
        now,
      }),
    ).toBe(false);
  });

  test("honours a per-template override", () => {
    expect(
      isTemplateImageFresh({
        downloadedAt: daysAgo(3),
        refreshDays: 1,
        now,
      }),
    ).toBe(false);
    expect(
      isTemplateImageFresh({
        downloadedAt: daysAgo(3),
        refreshDays: 30,
        now,
      }),
    ).toBe(true);
  });

  test("a non-positive window never expires on age", () => {
    expect(
      isTemplateImageFresh({
        downloadedAt: daysAgo(3650),
        refreshDays: 0,
        now,
      }),
    ).toBe(true);
  });

  test("a changed checksum beats a still-open age window", () => {
    // The operator repointed the template at different bytes; serving the old
    // ones would be wrong however recently they were fetched.
    expect(
      isTemplateImageFresh({
        downloadedAt: daysAgo(0),
        storedChecksum: CHECKSUM,
        expectedChecksum: `ff${CHECKSUM}`,
        now,
      }),
    ).toBe(false);
  });

  test("treats null and undefined checksums as the same", () => {
    expect(
      isTemplateImageFresh({
        downloadedAt: daysAgo(0),
        storedChecksum: null,
        expectedChecksum: undefined,
        now,
      }),
    ).toBe(true);
  });

  test("adding a checksum to a previously unpinned image forces a refresh", () => {
    expect(
      isTemplateImageFresh({
        downloadedAt: daysAgo(0),
        storedChecksum: null,
        expectedChecksum: CHECKSUM,
        now,
      }),
    ).toBe(false);
  });
});
