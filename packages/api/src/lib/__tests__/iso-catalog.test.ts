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
import { ISO_CATALOG } from "@virtbase/utils";
import { UploadProxmoxIsoInputSchema } from "@virtbase/validators";

/**
 * `@virtbase/utils` is a layer 0 package and cannot import the validators, so
 * this is where the catalog meets the schema its entries have to satisfy. A
 * catalog entry fills the very same form fields a customer would type into, so
 * anything the schema rejects would fail at `iso.upload` with an opaque
 * `BAD_REQUEST` after the customer already clicked.
 *
 * Reachability of the URLs is deliberately not tested - that is a network
 * check to run when an entry is added or bumped, not on every test run.
 */
describe("ISO_CATALOG", () => {
  test("is not empty", () => {
    expect(ISO_CATALOG.length).toBeGreaterThan(0);
  });

  test("has unique ids", () => {
    const ids = ISO_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(ISO_CATALOG.map((entry) => [entry.id, entry] as const))(
    "%s satisfies the upload schema",
    (_id, entry) => {
      const result = UploadProxmoxIsoInputSchema.safeParse({
        name: entry.name,
        url: entry.url,
      });

      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.success).toBe(true);
    },
  );

  test.each(ISO_CATALOG.map((entry) => [entry.id, entry] as const))(
    "%s has a valid release date",
    (_id, entry) => {
      expect(entry.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const parsed = new Date(`${entry.releasedAt}T00:00:00Z`);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      // A round trip catches an impossible day such as `2026-02-31`, which
      // `Date` silently rolls over into March.
      expect(parsed.toISOString().slice(0, 10)).toBe(entry.releasedAt);
    },
  );

  test.each(ISO_CATALOG.map((entry) => [entry.id, entry] as const))(
    "%s pins a checksum only where the bytes cannot change",
    (_id, entry) => {
      if (entry.sha256 === null) {
        return;
      }

      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      // A `-latest-` alias is repointed on every point release, so a pinned
      // hash there becomes a failing download rather than a safety net.
      expect(entry.url).not.toContain("-latest-");
    },
  );

  test.each(ISO_CATALOG.map((entry) => [entry.id, entry] as const))(
    "%s has a same-origin icon",
    (_id, entry) => {
      if (entry.icon === null) {
        return;
      }

      // The CSP only allows `img-src 'self'`, so a remote logo would be
      // blocked and render as a broken image.
      expect(entry.icon).toMatch(/^\/assets\/static\/distros\/[\w-]+\.svg$/);
    },
  );
});
