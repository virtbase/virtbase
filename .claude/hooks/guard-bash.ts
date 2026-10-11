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

import { readHookInput } from "./shared";

/**
 * Claude Code `PreToolUse` hook for the Bash tool. Blocks shell commands that
 * break the git and test rules in `docs/style`, before they run.
 *
 * The rules are checked per segment: the command is split at `;`, `&&`, `||`,
 * `|` and line breaks, and a rule matches only a segment that starts with the
 * command it governs. Text that merely mentions a flag, such as a heredoc or a
 * quoted string, is therefore not blocked.
 *
 * Exit code 2 blocks the command and shows stderr to Claude. Exit code 0 lets
 * the command run.
 */

const FORBIDDEN: readonly { segment: RegExp; rule: string }[] = [
  {
    segment: /^git\b.*\s--no-verify\b|^git\s+commit\b.*\s-n\b/,
    rule: "GIT-5: never skip the git hooks; fix what they report.",
  },
  {
    segment: /^gh\s+pr\s+ready\b/,
    rule: "GIT-7: pull requests stay drafts; the user marks them ready.",
  },
  {
    segment: /^git\s+push\b.*\s(--force|-f)\b.*\bmain\b/,
    rule: "GIT-6: never force-push to main.",
  },
  {
    segment: /^bun\s+test(?=\s|$)/,
    rule: "TST-1: run `bun run test`, never bare `bun test`.",
  },
];

const ATTRIBUTION = /Co-Authored-By|Generated with \[?Claude Code/i;
const PUBLISHES_TEXT = /^(git\s+commit|gh\s+pr\s+(create|edit))\b/;

const { command } = await readHookInput();
const segments = command
  .split(/;|&&|\|\||\||\n/)
  .map((segment) => segment.trim());

const broken =
  FORBIDDEN.find(({ segment }) => segments.some((s) => segment.test(s))) ??
  (ATTRIBUTION.test(command) && segments.some((s) => PUBLISHES_TEXT.test(s))
    ? { rule: "GIT-4: no attribution footers in commits or pull requests." }
    : undefined);

if (broken) {
  console.error(`Blocked by .claude/hooks/guard-bash.ts. ${broken.rule}`);
  process.exit(2);
}
