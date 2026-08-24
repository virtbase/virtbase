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

import type { ProxmoxVm } from "./types";
import { unwrapAgentResult } from "./unwrap-result";

/**
 * The `id` QEMU reports for a Windows guest.
 *
 * Every guest inspection Virtbase does - listening sockets, firewall rules -
 * assumes POSIX tooling, so this is the flag that keeps those probes from
 * running commands that cannot exist.
 */
export const WINDOWS_OS_ID = "mswindows";

export interface GuestOsInfo {
  /** `os-release` ID, e.g. `debian`, `ubuntu`, `rocky`, or `mswindows`. */
  id: string | null;
  /** `os-release` PRETTY_NAME, e.g. `Debian GNU/Linux 12 (bookworm)`. */
  prettyName: string | null;
  version: string | null;
  kernelRelease: string | null;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

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
