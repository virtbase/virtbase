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
import { resolveServerOperatingSystem } from "../server-operating-system";

const DETECTED_AT = new Date("2026-08-26T10:00:00.000Z");

const undetected = {
  detectedOsId: null,
  detectedOsName: null,
  detectedOsAt: null,
};

const debianTemplate = {
  name: "Debian 12 (Bookworm)",
  icon: "/assets/static/distros/debian.svg",
};

describe("resolveServerOperatingSystem", () => {
  test("a detected guest wins over the template it was installed from", () => {
    // The whole point of the feature: somebody installed Arch over Debian.
    const resolved = resolveServerOperatingSystem({
      server: {
        detectedOsId: "arch",
        detectedOsName: "Arch Linux",
        detectedOsAt: DETECTED_AT,
      },
      template: debianTemplate,
    });

    expect(resolved).toEqual({
      slug: "archlinux",
      name: "Arch Linux",
      icon: "/assets/static/distros/archlinux.svg",
      source: "detected",
      detected_at: DETECTED_AT,
    });
  });

  test("a detected guest wins over a mounted ISO", () => {
    const resolved = resolveServerOperatingSystem({
      server: {
        detectedOsId: "debian",
        detectedOsName: "Debian GNU/Linux 13 (trixie)",
        detectedOsAt: DETECTED_AT,
      },
      mount: { name: "Ubuntu Server 24.04 LTS", url: "https://x/u.iso" },
      template: debianTemplate,
    });

    expect(resolved.source).toBe("detected");
    expect(resolved.slug).toBe("debian");
  });

  test("it prefers the guest's own name over the catalog label", () => {
    const resolved = resolveServerOperatingSystem({
      server: {
        detectedOsId: "debian",
        detectedOsName: "Debian GNU/Linux 13 (trixie)",
        detectedOsAt: DETECTED_AT,
      },
    });

    expect(resolved.name).toBe("Debian GNU/Linux 13 (trixie)");
  });

  test("a guest we have no logo for keeps its name and loses its icon", () => {
    const resolved = resolveServerOperatingSystem({
      server: {
        detectedOsId: "plan9",
        detectedOsName: "Plan 9 from Bell Labs",
        detectedOsAt: DETECTED_AT,
      },
    });

    expect(resolved.source).toBe("detected");
    expect(resolved.name).toBe("Plan 9 from Bell Labs");
    expect(resolved.slug).toBeNull();
    expect(resolved.icon).toBeNull();
  });

  test("detection without a timestamp is not trusted", () => {
    // Half-written rows should never outrank the template.
    const resolved = resolveServerOperatingSystem({
      server: {
        detectedOsId: "arch",
        detectedOsName: "Arch Linux",
        detectedOsAt: null,
      },
      template: debianTemplate,
    });

    expect(resolved.source).toBe("template");
  });

  test("a timestamp with no operating system behind it is not trusted", () => {
    const resolved = resolveServerOperatingSystem({
      server: {
        detectedOsId: null,
        detectedOsName: null,
        detectedOsAt: DETECTED_AT,
      },
      template: debianTemplate,
    });

    expect(resolved.source).toBe("template");
  });

  test("an undetected server falls back to its mounted ISO", () => {
    const resolved = resolveServerOperatingSystem({
      server: undetected,
      mount: {
        name: "AlmaLinux 10",
        url: "https://repo.almalinux.org/x/AlmaLinux-10.iso",
      },
      template: debianTemplate,
    });

    expect(resolved).toEqual({
      slug: "almalinux",
      name: "AlmaLinux 10",
      icon: "/assets/static/distros/almalinux.svg",
      source: "iso",
      detected_at: null,
    });
  });

  test("an ISO is matched on its URL when its name says nothing", () => {
    const resolved = resolveServerOperatingSystem({
      server: undetected,
      mount: {
        name: "my install disc",
        url: "https://cdimage.debian.org/x/debian-13-amd64-netinst.iso",
      },
    });

    expect(resolved.slug).toBe("debian");
    expect(resolved.source).toBe("iso");
    // The customer named it, so the customer's name is what they see.
    expect(resolved.name).toBe("my install disc");
  });

  test("an undetected server with no ISO falls back to its template", () => {
    const resolved = resolveServerOperatingSystem({
      server: undetected,
      template: debianTemplate,
    });

    expect(resolved).toEqual({
      slug: "debian",
      name: "Debian 12 (Bookworm)",
      icon: "/assets/static/distros/debian.svg",
      source: "template",
      detected_at: null,
    });
  });

  test("the template's own icon stays authoritative for the template", () => {
    // An operator pointed a template at custom artwork; the catalog does not
    // get to override it.
    const resolved = resolveServerOperatingSystem({
      server: undetected,
      template: { name: "Debian 12", icon: "/assets/static/custom/thing.svg" },
    });

    expect(resolved.icon).toBe("/assets/static/custom/thing.svg");
    expect(resolved.slug).toBe("debian");
  });

  test("a server with nothing at all is unknown", () => {
    expect(resolveServerOperatingSystem({ server: undetected })).toEqual({
      slug: null,
      name: null,
      icon: null,
      source: "unknown",
      detected_at: null,
    });
  });

  test("empty mount and template objects do not count as a fallback", () => {
    const resolved = resolveServerOperatingSystem({
      server: undetected,
      mount: { name: null, url: null },
      template: { name: null, icon: null },
    });

    expect(resolved.source).toBe("unknown");
  });
});
