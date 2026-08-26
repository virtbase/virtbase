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
import { toDetectedOperatingSystem } from "../detect";
import { DETECTION_MAX_AGE_HOURS, isDetectionStale } from "../refresh";

const NOW = new Date("2026-08-26T12:00:00.000Z");

const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe("toDetectedOperatingSystem", () => {
  test("it maps a full agent reply onto the stored columns", () => {
    expect(
      toDetectedOperatingSystem({
        id: "debian",
        prettyName: "Debian GNU/Linux 13 (trixie)",
        name: "Debian GNU/Linux",
        version: "13 (trixie)",
        kernelRelease: "6.12.48+deb13-amd64",
      }),
    ).toEqual({
      detectedOsId: "debian",
      detectedOsName: "Debian GNU/Linux 13 (trixie)",
      detectedOsVersion: "13 (trixie)",
      detectedOsKernel: "6.12.48+deb13-amd64",
    });
  });

  test("it falls back to NAME when the guest set no PRETTY_NAME", () => {
    const detected = toDetectedOperatingSystem({
      id: "alpine",
      prettyName: null,
      name: "Alpine Linux",
      version: null,
      kernelRelease: null,
    });

    expect(detected?.detectedOsName).toBe("Alpine Linux");
  });

  test("an id with no name at all is still worth storing", () => {
    // A minimal image can report `ID=alpine` and nothing else; that is enough
    // to pick the right logo.
    const detected = toDetectedOperatingSystem({
      id: "alpine",
      prettyName: null,
      name: null,
      version: null,
      kernelRelease: null,
    });

    expect(detected).toEqual({
      detectedOsId: "alpine",
      detectedOsName: null,
      detectedOsVersion: null,
      detectedOsKernel: null,
    });
  });

  test("a reply with neither an id nor a name is no answer", () => {
    // Storing this would mark the server as successfully detected while
    // leaving nothing to render, which is worse than keeping the old value.
    expect(
      toDetectedOperatingSystem({
        id: null,
        prettyName: null,
        name: null,
        version: "13",
        kernelRelease: "6.12.0",
      }),
    ).toBeNull();
  });

  test("no reply is no answer", () => {
    expect(toDetectedOperatingSystem(null)).toBeNull();
  });
});

describe("isDetectionStale", () => {
  const server = { id: "kvm_1", detectedOsAt: hoursAgo(1) };

  test("a stopped server is never re-probed", () => {
    expect(
      isDetectionStale({
        server: { id: "kvm_1", detectedOsAt: null },
        running: false,
        now: NOW,
      }),
    ).toBe(false);
  });

  test("a running server that was never detected is stale", () => {
    expect(
      isDetectionStale({
        server: { id: "kvm_1", detectedOsAt: null },
        running: true,
        now: NOW,
      }),
    ).toBe(true);
  });

  test("a guest that booted after the last detection is stale", () => {
    // Detected an hour ago, up for ten minutes: it restarted in between, and
    // may have been reinstalled while it was down.
    expect(
      isDetectionStale({ server, running: true, uptime: 600, now: NOW }),
    ).toBe(true);
  });

  test("a guest that has been up since before the detection is fresh", () => {
    expect(
      isDetectionStale({ server, running: true, uptime: 7200, now: NOW }),
    ).toBe(false);
  });

  test("a detection older than the maximum age is stale even without a reboot", () => {
    expect(
      isDetectionStale({
        server: {
          id: "kvm_1",
          detectedOsAt: hoursAgo(DETECTION_MAX_AGE_HOURS + 1),
        },
        running: true,
        uptime: 60 * 60 * 24 * 30,
        now: NOW,
      }),
    ).toBe(true);
  });

  test("a recent detection with no uptime reported is fresh", () => {
    expect(isDetectionStale({ server, running: true, now: NOW })).toBe(false);
  });

  test("a nonsensical uptime is ignored rather than trusted", () => {
    expect(
      isDetectionStale({ server, running: true, uptime: -1, now: NOW }),
    ).toBe(false);
  });
});
