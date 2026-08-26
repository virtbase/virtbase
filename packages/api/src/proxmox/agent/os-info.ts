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

import { sanitizeGuestOsName, WINDOWS_OS_ID } from "@virtbase/utils";
import type { ProxmoxVm } from "./types";
import { unwrapAgentResult } from "./unwrap-result";

// Re-exported so the agent module stays the one import for guest inspection.
// The definition lives in `@virtbase/utils` because the operating system
// catalog needs it too, and layer 0 is the only place both can reach.
export { WINDOWS_OS_ID };

export interface GuestOsInfo {
  /** `os-release` ID, e.g. `debian`, `ubuntu`, `rocky`, or `mswindows`. */
  id: string | null;
  /** `os-release` PRETTY_NAME, e.g. `Debian GNU/Linux 12 (bookworm)`. */
  prettyName: string | null;
  /** `os-release` NAME, e.g. `Debian GNU/Linux`. */
  name: string | null;
  version: string | null;
  kernelRelease: string | null;
}

/**
 * Every string here comes out of `/etc/os-release` inside the customer's
 * server, so it is sanitised at the boundary rather than at each of the places
 * that store or render it.
 */
const asString = (value: unknown): string | null =>
  typeof value === "string" ? sanitizeGuestOsName(value) : null;

/**
 * Reads the guest's operating system through the agent.
 *
 * Returns `null` when the agent cannot answer - a stopped VM, no agent, an
 * agent too old for `guest-get-osinfo`. Callers treat that as "unknown OS"
 * rather than an error, which is why this swallows instead of classifying:
 * anything that makes this fail also makes {@link probeGuestAgent} fail, and
 * that is where the reason belongs.
 */
export const getGuestOsInfo = async (
  vm: ProxmoxVm,
): Promise<GuestOsInfo | null> => {
  let raw: unknown;
  try {
    raw = unwrapAgentResult(await vm.agent["get-osinfo"].$get());
  } catch {
    return null;
  }

  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const info = raw as Record<string, unknown>;

  return {
    id: asString(info.id),
    prettyName: asString(info["pretty-name"]),
    name: asString(info.name),
    version: asString(info.version),
    kernelRelease: asString(info["kernel-release"]),
  };
};

/**
 * Whether the guest is one the POSIX-based probes can inspect.
 *
 * Unknown counts as supported: an agent that does not report its OS is far more
 * likely to be a minimal Linux image than Windows, and a probe that fails is
 * cheaper than a feature that silently refuses to run.
 */
export const isPosixGuest = (os: GuestOsInfo | null): boolean =>
  os?.id !== WINDOWS_OS_ID;
