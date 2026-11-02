/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * The help center's categories, in the order they are shown. Each is served at
 * `/<locale>/help/category/<slug>`.
 *
 * Kept free of imports: the frontmatter schema in `source.config.ts` and the
 * proxy both read it, and neither may pull in React or next-intl. Titles,
 * descriptions and icons live in `features/help/categories.tsx`.
 */
export const HELP_CATEGORIES = [
  "getting-started",
  "servers",
  "backups",
  "networking",
  "billing",
  "account",
  "api",
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export function isHelpCategory(value: unknown): value is HelpCategory {
  return HELP_CATEGORIES.includes(value as HelpCategory);
}
