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

import type { GuestOsInfo } from "../proxmox/agent";

/**
 * What a successful detection contributes to a server row.
 *
 * Mirrors the `detected_os_*` columns exactly, so persisting is a spread and
 * there is no second place that decides which fields are kept.
 */
export interface DetectedOperatingSystem {
  detectedOsId: string | null;
  detectedOsName: string | null;
  detectedOsVersion: string | null;
  detectedOsKernel: string | null;
}

/**
 * Turns an agent reply into the columns we store, or `null` when it says
 * nothing useful.
 *
 * A reply that carries neither an `id` nor a name is treated as no answer at
 * all: writing it would move `detected_os_at` forward and mark a server as
 * successfully detected while leaving the UI with nothing to show, which is
 * strictly worse than leaving the previous value in place.
 *
 * The strings are already sanitised - `getGuestOsInfo` cleans them at the
 * boundary, because they come out of a file inside the customer's server.
 */
export const toDetectedOperatingSystem = (
  os: GuestOsInfo | null,
): DetectedOperatingSystem | null => {
  if (!os) {
    return null;
  }

  const name = os.prettyName ?? os.name;

  if (!(os.id || name)) {
    return null;
  }

  return {
    detectedOsId: os.id,
    detectedOsName: name,
    detectedOsVersion: os.version,
    detectedOsKernel: os.kernelRelease,
  };
};
