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

import { repairFirewallRule } from "@virtbase/utils";

/**
 * The model used for rule generation, as the Vercel AI Gateway names it.
 */
export const FIREWALL_AI_MODEL = "anthropic/claude-haiku-4.5";

/**
 * Budget for one generation, retries included.
 */
export const GENERATION_TIMEOUT_MS = 25_000;

/**
 * Normalises the model's JSON before the schema validates it.
 *
 * Runs on the raw text because that is the only hook the SDK offers, so the
 * repairs are applied by re-serialising the parsed object. Text that is not
 * JSON at all is handed back untouched for the SDK to retry.
 *
 * @see {@link repairFirewallRule} for what is repaired and what is deliberately
 *   left to fail.
 */
export const repairGeneratedText = (text: string): string => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { rules?: unknown }).rules)
  ) {
    return text;
  }

  const payload = parsed as { rules: unknown[] };

  return JSON.stringify({
    ...payload,
    rules: payload.rules.map((rule) =>
      typeof rule === "object" && rule !== null
        ? repairFirewallRule(rule as Record<string, unknown>)
        : rule,
    ),
  });
};
