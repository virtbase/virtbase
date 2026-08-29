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

export const MAX_ABUSE_TITLE_LENGTH = 500;
export const MAX_ABUSE_BODY_LENGTH = 50_000;
export const MAX_ABUSE_REPORTER_LENGTH = 320;

/**
 * Characters that change how text renders rather than what it says:
 * bidirectional overrides, zero-width joiners, and the C0/C1 control ranges.
 *
 * A reporter who can put a right-to-left override in an abuse report can make
 * the admin console display an address that is not the one on the case.
 */
const isFormatting = (codePoint: number): boolean =>
  (codePoint <= 0x1f && codePoint !== 0x0a) || // C0, keeping newline
  (codePoint >= 0x7f && codePoint <= 0x9f) || // DEL and C1
  codePoint === 0x00ad || // soft hyphen
  (codePoint >= 0x200b && codePoint <= 0x200f) || // zero width, LRM/RLM
  (codePoint >= 0x2028 && codePoint <= 0x202e) || // separators, bidi overrides
  (codePoint >= 0x2060 && codePoint <= 0x2064) ||
  (codePoint >= 0x2066 && codePoint <= 0x2069) || // bidi isolates
  codePoint === 0xfeff;

/**
 * Makes reporter-supplied text safe to store and render.
 *
 * The same posture `sanitizeGuestOsName` takes for a guest's `os-release`:
 * strip formatting characters, collapse whitespace and cap the length. It is
 * not an escape — every sink that interprets markup escapes again — it is
 * what stops the stored value from being a display attack in the first place.
 *
 * `multiline` keeps newlines, because an abuse report's body is a letter and
 * folding it onto one line makes it unreadable.
 */
export const sanitizeAbuseText = (
  value: string | null | undefined,
  { maxLength, multiline = false }: { maxLength: number; multiline?: boolean },
): string | null => {
  if ("string" !== typeof value) return null;

  const cleaned = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (undefined !== codePoint && isFormatting(codePoint)) return " ";
    return character;
  })
    .join("")
    .replace(multiline ? /[^\S\n]+/g : /\s+/g, " ")
    // Three blank lines in a row are a quoting artefact, never meaning.
    .replace(multiline ? /\n{3,}/g : /\n+/g, multiline ? "\n\n" : " ")
    .trim()
    .slice(0, maxLength)
    .trim();

  return cleaned.length > 0 ? cleaned : null;
};

export const sanitizeAbuseTitle = (value: string | null | undefined) =>
  sanitizeAbuseText(value, { maxLength: MAX_ABUSE_TITLE_LENGTH });

export const sanitizeAbuseBody = (value: string | null | undefined) =>
  sanitizeAbuseText(value, {
    maxLength: MAX_ABUSE_BODY_LENGTH,
    multiline: true,
  });
