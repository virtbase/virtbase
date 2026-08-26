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

import type { servers } from "@virtbase/db/schema";

/**
 * The `detected_os_*` columns, blanked.
 *
 * Exported so the rebuild workflows can fold this into an update they are
 * already making rather than opening a second transaction for it, and so all
 * of them forget exactly the same set of columns.
 *
 * [!] This file has to stay free of runtime imports. It is reached from inside
 * `"use workflow"` functions, which are bundled for a runtime with no Node
 * built-ins - importing it through the `guest-os` barrel drags in Redis and
 * therefore `node:crypto`, and the build fails. The type import above is
 * erased, so it costs nothing.
 */
export const CLEARED_OPERATING_SYSTEM = {
  detectedOsId: null,
  detectedOsName: null,
  detectedOsVersion: null,
  detectedOsKernel: null,
  detectedOsAt: null,
} as const satisfies Partial<typeof servers.$inferInsert>;
