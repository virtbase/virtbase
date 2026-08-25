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

import { createDiscordClient } from "../api";
import type { DiscordContext } from "../config";
import { reconcileCommands } from "./commands";
import { reconcileEmojis } from "./emojis";
import { reconcileRoleConnections } from "./role-connections";
import type { Reconciler, SyncResult } from "./types";

export * from "./canonical";
export * from "./types";

/**
 * Everything this package owns on Discord's side. Adding a resource is adding
 * a line here.
 */
const RECONCILERS: Reconciler[] = [
  reconcileCommands,
  reconcileRoleConnections,
  reconcileEmojis,
];

/**
 * Brings Discord in line with what this package declares.
 *
 * Runs from two places: `onEnable`, so turning the integration on is all the
 * setup there is, and `health`, so drift — a command deleted by hand, a
 * deployment that shipped a new one — is repaired within the health cron's
 * half hour rather than waiting for somebody to notice.
 *
 * It never throws. A reconciler that fails is reported in its own result and
 * the others still run: one broken resource must not stop the rest from being
 * registered, and a health probe that throws tells an admin nothing about
 * which part is broken.
 */
export const runDiscordSync = async (
  ctx: DiscordContext,
): Promise<SyncResult[]> => {
  const client = createDiscordClient({
    appId: ctx.settings.appId,
    botToken: ctx.secrets.botToken,
    logger: ctx.logger,
  });

  const results: SyncResult[] = [];

  for (const reconcile of RECONCILERS) {
    try {
      const result = await reconcile(client);
      if (result.changed) {
        ctx.logger.info(`[discord] Synced ${result.name}`, {
          detail: result.detail,
        });
      }
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger.error(`[discord] Failed to sync`, { error: message });
      results.push({ name: reconcile.name, changed: false, error: message });
    }
  }

  return results;
};

/** One line for a health message: what changed, and what failed. */
export const summarizeSync = (results: SyncResult[]): string => {
  const failed = results.filter((result) => result.error);
  const changed = results.filter((result) => result.changed);

  return [
    failed.length > 0 &&
      `failed: ${failed.map((r) => `${r.name} (${r.error})`).join(", ")}`,
    changed.length > 0 &&
      `re-registered: ${changed.map((r) => r.name).join(", ")}`,
  ]
    .filter((part): part is string => typeof part === "string")
    .join("; ");
};
