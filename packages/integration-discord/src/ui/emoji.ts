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

/**
 * Every unicode emoji the bot puts on a component.
 *
 * They live in one file because Discord rejects the *entire message* when one
 * of them is not an emoji it recognises — `COMPONENT_INVALID_EMOJI`, and the
 * customer sees "did not respond in time" rather than a missing glyph. The
 * character that caused it was `⏻` (U+23FB POWER SYMBOL), which looks like an
 * emoji in an editor and is actually a technical symbol with no emoji
 * presentation.
 *
 * Adding one here means it gets checked by `emoji.test.ts`. Writing one inline
 * at a call site does not.
 */
export const EMOJI = {
  /** Navigation. */
  back: "◀️",
  next: "▶️",
  previous: "◀️",
  external: "↗️",
  refresh: "🔄",
  cancel: "✖️",

  /** Power. */
  power: "⚡",
  start: "▶️",
  reboot: "🔄",
  // A graceful stop is the ordinary one; the barrier is for cutting the power.
  shutdown: "⏹️",
  forceStop: "⛔",
  reset: "⚠️",

  /** Features. */
  servers: "🖥️",
  console: "🖥️",
  backups: "💾",
  firewall: "🛡️",
  rdns: "🌐",
  settings: "🔧",
  advanced: "⚙️",
  plan: "📦",
  stats: "📈",
  disc: "💿",
  key: "🔑",

  /** Actions. */
  add: "➕",
  edit: "✏️",
  delete: "🗑️",
  restore: "♻️",
  reinstall: "♻️",
  lock: "🔒",
  unlock: "🔓",
  eject: "⏏️",

  /** Prose. */
  guide: "📖",
  idea: "💡",
  warning: "⚠️",
  medal: "🏅",
} as const;

export type EmojiName = keyof typeof EMOJI;

/**
 * BMP characters that render as emoji without a variation selector.
 *
 * Most emoji below U+1F000 are text symbols that only become emoji when
 * followed by U+FE0F. These few carry `Emoji_Presentation=Yes` and are emoji on
 * their own, which is why they are allowed bare — and why the list is explicit
 * rather than a range.
 */
const DEFAULT_PRESENTATION = new Set(["⚡", "➕", "⛔", "🔒", "🔓"]);

const VARIATION_SELECTOR = "️";

/**
 * Whether Discord will accept this string as a component emoji.
 *
 * Deliberately conservative: it would rather reject a valid emoji nobody has
 * used yet than let through one that takes a whole message down.
 */
export const isRenderableEmoji = (value: string): boolean => {
  const points = [...value];
  if (points.length === 0 || points.length > 2) return false;

  const [base, selector] = points as [string, string | undefined];
  if (selector !== undefined && selector !== VARIATION_SELECTOR) return false;

  const code = base.codePointAt(0) ?? 0;

  // Anything in the emoji planes is an emoji on its own.
  if (code >= 0x1_f000) return true;
  // A text symbol becomes one when it carries the variation selector.
  if (selector === VARIATION_SELECTOR) return true;

  return DEFAULT_PRESENTATION.has(base);
};
