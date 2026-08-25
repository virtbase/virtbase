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

import type { DiscordClient } from "../api";

/** What one reconciler did. `changed` means it wrote to Discord. */
export interface SyncResult {
  name: string;
  changed: boolean;
  /** Set when the reconciler failed. The run continues regardless. */
  error?: string;
  detail?: string;
}

/**
 * Brings one Discord-side resource in line with what this package declares.
 *
 * Every reconciler reads the current remote state, compares it to the desired
 * payload and writes only on drift. That is what makes it safe to run on every
 * health probe: a no-op costs one GET, and a hand-edit in the developer portal
 * is repaired within the cron's half hour.
 */
export type Reconciler = (client: DiscordClient) => Promise<SyncResult>;
