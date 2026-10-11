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

import type { ParserPlugin } from "@babel/parser";
import { parse } from "@babel/parser";
import type { CommentLine } from "./comments";

/** One comment line that breaks a rule of `docs/style/comments.md`. */
export interface Violation {
  path: string;
  line: number;
  rule: "CMT-8" | "CMT-10" | "CMT-11";
  message: string;
}

/**
 * The CMT-8 list, word for word. `rules.test.ts` fails when it and
 * `docs/style/comments.md` differ.
 */
export const HEDGES = [
  "should",
  "might",
  "maybe",
  "perhaps",
  "probably",
  "hopefully",
  "seems",
  "I think",
  "not sure",
  "for now",
  "temporary",
  "temporarily",
  "currently",
  "at the moment",
  "for the time being",
  "quick fix",
  "hack",
  "somehow",
  "magic",
  "TBD",
] as const;

const CONTRACTED: ReadonlySet<string> = new Set(["should", "might"]);

const hedgePattern = (hedge: string) => {
  const words = hedge.split(" ").join("\\s+");
  return CONTRACTED.has(hedge) ? `${words}(?:n['’]t)?` : words;
};

const HEDGE = new RegExp(
  `\\b(?:${HEDGES.map(hedgePattern).join("|")})\\b`,
  "gi",
);
const TODO_WITHOUT_ISSUE = /\bTODO\b(?!\(#\d+\):(?:\s|$))/;
const MARKER = /\b(?:FIXME|HACK|XXX)\b/;
const CODE_PUNCTUATION = /[;(){}=]/;
const CODE_ENDING = /(?:[;{}]|\/>)\s*$/;
const CODE_IN_BLOCK = /[;{}]|\/>/;
const DIRECTIVE = /^(?:\/|biome-ignore|@ts-|eslint-|#region|#endregion)/;
const QUOTED = /`[^`\n]*`/g;
const URL_PATTERN = /https?:\/\/\S+/g;

const HEDGE_MESSAGE = (hedge: string) =>
  `"${hedge}" is on the hedge list; state the fact, the requirement or the condition`;

/**
 * Checks the comment lines of one file that a change added, and returns every
 * violation, sorted by line.
 *
 * Lines the change did not add are never checked, so the gate applies to new
 * comments without asking for a rewrite of the existing ones. A hedge phrase
 * wrapped across lines is reported on its first line when any of its lines was
 * added.
 */
export const findViolations = ({
  path,
  comments,
  added,
}: {
  path: string;
  comments: CommentLine[];
  added: ReadonlySet<number>;
}): Violation[] => {
  const checked = comments.filter((comment) => comment.kind !== "licence");
  const onLines = checked
    .filter((comment) => added.has(comment.line))
    .flatMap((comment) =>
      checkLine(comment).map((violation) => ({
        path,
        line: comment.line,
        ...violation,
      })),
    );
  const blocks = new Map(
    checked.map((comment) => [comment.blockLine, comment]),
  );
  const acrossLines = [...blocks.values()].flatMap((comment) =>
    findWrappedHedges(comment, added).map(({ line, hedge }) => ({
      path,
      line,
      rule: "CMT-8" as const,
      message: HEDGE_MESSAGE(hedge),
    })),
  );
  return [...onLines, ...acrossLines].sort((a, b) => a.line - b.line);
};

const checkLine = (
  comment: CommentLine,
): Pick<Violation, "rule" | "message">[] => {
  const violations: Pick<Violation, "rule" | "message">[] = [];
  const text = stripQuotedAndUrls(comment.text);

  for (const [hedge] of text.matchAll(HEDGE)) {
    if (hedge === "HACK") continue;
    violations.push({ rule: "CMT-8", message: HEDGE_MESSAGE(hedge) });
  }
  if (TODO_WITHOUT_ISSUE.test(text)) {
    violations.push({
      rule: "CMT-10",
      message:
        "a TODO names an open issue: TODO(#123): <action> when <condition>",
    });
  }
  if (MARKER.test(text)) {
    violations.push({
      rule: "CMT-10",
      message:
        "FIXME, HACK and XXX are never allowed; fix it, or open an issue and write a TODO(#123)",
    });
  }
  if (comment.kind === "plain" && isCommentedOutCode(comment)) {
    violations.push({
      rule: "CMT-11",
      message: "commented-out code; delete it, the history keeps it",
    });
  }
  return violations;
};

const findWrappedHedges = (
  comment: CommentLine,
  added: ReadonlySet<number>,
): { line: number; hedge: string }[] => {
  const block = stripQuotedAndUrls(comment.block);
  const found: { line: number; hedge: string }[] = [];
  for (const match of block.matchAll(HEDGE)) {
    if (!match[0].includes("\n")) continue;
    const first =
      comment.blockLine +
      (block.slice(0, match.index).match(/\n/g)?.length ?? 0);
    const last = first + (match[0].match(/\n/g)?.length ?? 0);
    for (let line = first; line <= last; line++) {
      if (added.has(line)) {
        found.push({ line: first, hedge: match[0].replace(/\s+/g, " ") });
        break;
      }
    }
  }
  return found;
};

/**
 * Whether a plain comment line is commented-out code.
 *
 * Directives (`///`, `biome-ignore`, `@ts-`, `eslint-`, `#region`) never
 * are. Otherwise, with spans in backticks and URLs removed, the line is code
 * when it ends like a statement or a JSX element (`;`, `{`, `}`, `/>`) and
 * parses as TypeScript or TSX, or when it holds code punctuation and its whole
 * block, which holds a `;`, a brace or a `/>`, parses.
 */
export const isCommentedOutCode = ({ text, block }: CommentLine): boolean => {
  if (DIRECTIVE.test(text)) return false;
  const line = stripQuotedAndUrls(text);
  if (CODE_ENDING.test(line) && isParseableCode(line)) return true;
  const whole = stripQuotedAndUrls(block);
  return (
    CODE_PUNCTUATION.test(line) &&
    CODE_IN_BLOCK.test(whole) &&
    isParseableCode(whole)
  );
};

const stripQuotedAndUrls = (text: string) =>
  text.replace(QUOTED, "").replace(URL_PATTERN, "");

const PARSER_PLUGINS: ParserPlugin[][] = [
  ["typescript"],
  ["typescript", "jsx"],
];

const isParseableCode = (text: string): boolean =>
  PARSER_PLUGINS.some((plugins) => {
    try {
      parse(text, {
        sourceType: "module",
        plugins,
        allowAwaitOutsideFunction: true,
        allowReturnOutsideFunction: true,
        allowNewTargetOutsideFunction: true,
        allowSuperOutsideMethod: true,
        allowUndeclaredExports: true,
      });
      return true;
    } catch {
      // Babel reports a syntax error by throwing, and text that is not valid
      // code under these plugins is prose.
      return false;
    }
  });
