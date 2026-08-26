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

import * as Sentry from "@sentry/node";
import { eq } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { servers } from "@virtbase/db/schema";
import type { GuestOsInfo } from "../proxmox/agent";
import { getGuestOsInfo } from "../proxmox/agent";
import type { ProxmoxVm } from "../proxmox/agent/types";
import { invalidateCached, once } from "../upstash";
import type { DetectedOperatingSystem } from "./detect";
import { toDetectedOperatingSystem } from "./detect";

type Database = typeof database;

/**
 * How often a single server may be probed for its operating system.
 *
 * Also the retry cadence: `qemu-guest-agent` takes a few seconds to tens of
 * seconds to come up after a boot, so a server that has just restarted is
 * re-probed once a minute until it answers. Short enough that "queried at
 * startup" is true to within a minute, long enough that the status page - which
 * polls every five seconds, from every open tab - cannot turn into load on a
 * customer's server.
 */
const DETECTION_GUARD_SECONDS = 60;

/**
 * How long a successful detection is trusted without re-checking.
 *
 * Only relevant for a server that never reboots; a restart invalidates the
 * detection on its own through {@link isDetectionStale}.
 */
export const DETECTION_MAX_AGE_HOURS = 24;

/** The Redis key rate-limiting detection for one server. */
const detectionGuardKey = (serverId: string) => `guest-os:${serverId}`;

export interface DetectionSubject {
  id: string;
  detectedOsAt: Date | null;
}

export interface IsDetectionStaleParams {
  server: DetectionSubject;
  /** Whether the server is running. A stopped guest cannot be asked. */
  running: boolean;
  /** The guest's uptime in seconds, as Proxmox reports it. */
  uptime?: number | null;
  now?: Date;
}

/**
 * Whether a server's operating system is worth re-reading.
 *
 * The interesting case is the middle one. Proxmox has no way to tell us a
 * guest rebooted, but it does report uptime, and a guest whose boot happened
 * after our last successful look is a guest that may have been reinstalled
 * since - which is exactly the moment this feature exists to catch. Comparing
 * against the boot time rather than polling on a timer means a reboot is
 * noticed on the first status read that follows it.
 */
export const isDetectionStale = ({
  server,
  running,
  uptime,
  now = new Date(),
}: IsDetectionStaleParams): boolean => {
  if (!running) {
    return false;
  }

  const { detectedOsAt } = server;

  if (!detectedOsAt) {
    return true;
  }

  if (typeof uptime === "number" && uptime >= 0) {
    const bootedAt = now.getTime() - uptime * 1000;

    if (detectedOsAt.getTime() < bootedAt) {
      return true;
    }
  }

  return (
    now.getTime() - detectedOsAt.getTime() >
    DETECTION_MAX_AGE_HOURS * 60 * 60 * 1000
  );
};

/**
 * Writes what an agent reported, for a caller that already has the answer.
 *
 * Split out of {@link refreshServerOperatingSystem} so the guest agent status
 * endpoint - which reads `guest-get-osinfo` anyway, to decide whether the
 * guest is one the POSIX probes can inspect - can persist that reply instead
 * of paying for a second identical call.
 *
 * Never throws, and writes nothing at all when the reply says nothing: see
 * {@link refreshServerOperatingSystem} for why a failure must not clear the
 * previous value.
 *
 * @returns what was stored, or `null` if nothing was.
 */
export const storeDetectedOperatingSystem = async (
  db: Database,
  serverId: string,
  os: GuestOsInfo | null,
): Promise<DetectedOperatingSystem | null> => {
  const detected = toDetectedOperatingSystem(os);

  if (!detected) {
    return null;
  }

  try {
    await db
      .update(servers)
      .set({ ...detected, detectedOsAt: new Date() })
      .where(eq(servers.id, serverId));

    return detected;
  } catch (error) {
    // A detection that could not be stored is a stale logo, not a broken page.
    Sentry.captureException(error);

    return null;
  }
};

export interface RefreshServerOperatingSystemParams {
  db: Database;
  vm: ProxmoxVm;
  server: DetectionSubject;
  /** Skip the rate-limit guard. For an explicit "check now". */
  force?: boolean;
}

/**
 * Probes a running guest and stores what it reports.
 *
 * Guarded so that concurrent readers - several browser tabs, a cron run
 * overlapping a page load - cost one probe rather than one each.
 *
 * A probe that fails writes nothing at all, deliberately. An unreachable agent
 * means "we do not know right now", not "this server has no operating system",
 * and blanking the row every time a customer shuts their server down would
 * make the dashboard flicker between the real OS and the template. The stored
 * value is only ever cleared by the workflows that rebuild a server, where it
 * is known to be wrong.
 *
 * Never throws: this runs beside features that must not fail because a node is
 * unreachable.
 *
 * @returns what was stored, or `null` if nothing was.
 */
export const refreshServerOperatingSystem = async ({
  db,
  vm,
  server,
  force = false,
}: RefreshServerOperatingSystemParams): Promise<DetectedOperatingSystem | null> => {
  const permitted =
    force ||
    (await once(detectionGuardKey(server.id), DETECTION_GUARD_SECONDS));

  if (!permitted) {
    return null;
  }

  // `getGuestOsInfo` swallows its own failures and answers `null`, which is
  // exactly the "we do not know right now" that must not overwrite anything.
  return storeDetectedOperatingSystem(db, server.id, await getGuestOsInfo(vm));
};

/**
 * Drops the rate-limit guard, so the next read re-probes immediately.
 *
 * Used after a power action: a customer who just restarted their server should
 * not wait out the guard before the new operating system appears.
 */
export const invalidateDetectionGuard = (serverId: string): Promise<void> =>
  invalidateCached(detectionGuardKey(serverId));
