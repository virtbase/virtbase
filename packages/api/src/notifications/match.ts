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

import type { NotificationSeverity } from "@virtbase/ports";

/** Ordered so a target can say "warning and above" with a comparison. */
export const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export const meetsSeverity = (
  minimum: NotificationSeverity,
  actual: NotificationSeverity,
): boolean => SEVERITY_RANK[actual] >= SEVERITY_RANK[minimum];

/**
 * `*` matches everything, a trailing `*` matches a prefix, anything else is
 * exact.
 *
 * The same shape `EventSubscriber.types` documents, so an operator who has
 * configured one has not learned a second syntax.
 */
export const matchesKey = (glob: string, key: string): boolean => {
  if ("*" === glob) return true;
  if (glob.endsWith("*")) return key.startsWith(glob.slice(0, -1));
  return glob === key;
};

export const matchesAnyKey = (globs: readonly string[], key: string): boolean =>
  globs.some((glob) => matchesKey(glob, key));
