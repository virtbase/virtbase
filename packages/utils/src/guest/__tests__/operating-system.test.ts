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
  MAX_GUEST_OS_NAME_LENGTH,
  OPERATING_SYSTEMS,
  resolveOperatingSystem,
  sanitizeGuestOsName,
  WINDOWS_OS_ID,
} from "../operating-system";

describe("OPERATING_SYSTEMS", () => {
  test("every slug is unique", () => {
    const slugs = OPERATING_SYSTEMS.map((entry) => entry.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("no id is claimed by two entries", () => {
    const ids = OPERATING_SYSTEMS.flatMap((entry) => entry.ids);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every icon points at the distro asset for its slug", () => {
    for (const entry of OPERATING_SYSTEMS) {
      expect(entry.icon).toBe(`/assets/static/distros/${entry.slug}.svg`);
    }
  });

  test("the generic linux catch-all is last", () => {
    expect(OPERATING_SYSTEMS.at(-1)?.slug).toBe("linux");
  });
});

describe("resolveOperatingSystem", () => {
  test("it resolves an os-release id exactly", () => {
    expect(resolveOperatingSystem({ id: "debian" })?.slug).toBe("debian");
    expect(resolveOperatingSystem({ id: "almalinux" })?.slug).toBe("almalinux");
    expect(resolveOperatingSystem({ id: "alpine" })?.slug).toBe("alpine");
  });

  test("it resolves the Windows id QEMU reports", () => {
    const windows = resolveOperatingSystem({ id: WINDOWS_OS_ID });

    expect(windows?.slug).toBe("windows");
    expect(windows?.icon).toBe("/assets/static/distros/windows.svg");
  });

  test("an id wins over free text that says otherwise", () => {
    // A customer who installed Arch over a Debian template: the guest's own
    // `os-release` is the truth, the template name is stale.
    const resolved = resolveOperatingSystem({
      id: "arch",
      text: "Debian 12 (Bookworm)",
    });

    expect(resolved?.slug).toBe("archlinux");
  });

  test("an id is matched case-insensitively and trimmed", () => {
    expect(resolveOperatingSystem({ id: " Ubuntu " })?.slug).toBe("ubuntu");
  });

  test("an unknown id falls through to the free text", () => {
    const resolved = resolveOperatingSystem({
      id: "totally-made-up",
      text: "Rocky Linux 9",
    });

    expect(resolved?.slug).toBe("rocky");
  });

  test("it matches a template name when there is no id", () => {
    expect(resolveOperatingSystem({ text: "Debian 13 (trixie)" })?.slug).toBe(
      "debian",
    );
    expect(
      resolveOperatingSystem({ text: "Ubuntu Server 24.04 LTS" })?.slug,
    ).toBe("ubuntu");
  });

  test("it matches a template icon path", () => {
    expect(
      resolveOperatingSystem({ text: "/assets/static/distros/fedora.svg" })
        ?.slug,
    ).toBe("fedora");
  });

  test("it joins several text fragments before matching", () => {
    const resolved = resolveOperatingSystem({
      text: [
        "My install disc",
        "https://repo.almalinux.org/x/AlmaLinux-10.iso",
      ],
    });

    expect(resolved?.slug).toBe("almalinux");
  });

  test("alma and rocky win over centos, which they both claim to be", () => {
    expect(
      resolveOperatingSystem({ text: "AlmaLinux 9 (CentOS compatible)" })?.slug,
    ).toBe("almalinux");
    expect(
      resolveOperatingSystem({ text: "Rocky Linux 10, a CentOS rebuild" })
        ?.slug,
    ).toBe("rocky");
    expect(resolveOperatingSystem({ text: "CentOS Stream 9" })?.slug).toBe(
      "centos",
    );
  });

  test("a distribution with no logo of its own resolves to generic Linux", () => {
    expect(resolveOperatingSystem({ id: "gentoo" })?.slug).toBe("linux");
    expect(resolveOperatingSystem({ text: "Void Linux" })?.slug).toBe("linux");
  });

  test("nothing recognisable resolves to null", () => {
    expect(resolveOperatingSystem({ text: "My cool server" })).toBeNull();
    expect(resolveOperatingSystem({})).toBeNull();
    expect(resolveOperatingSystem({ id: null, text: null })).toBeNull();
    expect(resolveOperatingSystem({ text: [null, undefined] })).toBeNull();
  });
});

describe("sanitizeGuestOsName", () => {
  test("it keeps a real PRETTY_NAME untouched", () => {
    expect(sanitizeGuestOsName("Debian GNU/Linux 13 (trixie)")).toBe(
      "Debian GNU/Linux 13 (trixie)",
    );
  });

  test("it strips control characters", () => {
    // A guest is free to put anything in /etc/os-release, newlines included.
    expect(sanitizeGuestOsName("Debian\n\tGNU/Linux\u0000 13")).toBe(
      "Debian GNU/Linux 13",
    );
  });

  test("it strips bidi overrides that would reverse the rendered name", () => {
    expect(sanitizeGuestOsName("Debian\u202E nuGeurT \u202C")).toBe(
      "Debian nuGeurT",
    );
  });

  test("it strips zero-width characters", () => {
    expect(sanitizeGuestOsName("Deb\u200Bian\u200D 13")).toBe("Deb ian 13");
  });

  test("it collapses runs of whitespace", () => {
    expect(sanitizeGuestOsName("  Ubuntu    24.04   LTS  ")).toBe(
      "Ubuntu 24.04 LTS",
    );
  });

  test("it caps the length", () => {
    const sanitized = sanitizeGuestOsName("A".repeat(500));

    expect(sanitized).toHaveLength(MAX_GUEST_OS_NAME_LENGTH);
  });

  test("it never leaves trailing whitespace after the cap", () => {
    const sanitized = sanitizeGuestOsName(
      `${"A".repeat(MAX_GUEST_OS_NAME_LENGTH - 1)} B`,
    );

    expect(sanitized).toBe("A".repeat(MAX_GUEST_OS_NAME_LENGTH - 1));
  });

  test("anything empty once cleaned becomes null", () => {
    expect(sanitizeGuestOsName("   ")).toBeNull();
    expect(sanitizeGuestOsName("\u0000\u0001")).toBeNull();
    expect(sanitizeGuestOsName("")).toBeNull();
    expect(sanitizeGuestOsName(null)).toBeNull();
    expect(sanitizeGuestOsName(undefined)).toBeNull();
  });
});
