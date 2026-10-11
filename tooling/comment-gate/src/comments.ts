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

/** One line of a comment, without its `//`, `/*` or leading `*`. */
export interface CommentLine {
  line: number;
  text: string;
  /**
   * - `licence`: the GPL header CMT-16 requires, the first block comment of
   *   the file when it names the GNU General Public License;
   * - `doc`: a TSDoc comment, which opens with two asterisks;
   * - `plain`: every other comment.
   */
  kind: "licence" | "doc" | "plain";
  /**
   * The comment this line belongs to, joined with line breaks: every adjacent
   * `//` line, or the whole body of a block comment.
   */
  block: string;
  /** The line the block starts on. */
  blockLine: number;
}

/**
 * Lists the lines of every comment in a source file, in line order.
 *
 * Throws when Babel cannot recover from a syntax error in the file, because a
 * gate that skipped the file would pass comments it never read.
 */
export const extractCommentLines = (
  path: string,
  source: string,
): CommentLine[] => {
  const comments =
    parse(source, {
      sourceType: "module",
      plugins: selectPlugins(path),
      errorRecovery: true,
    }).comments ?? [];

  const result: CommentLine[] = [];
  const lineComments = comments.filter(
    (comment) => comment.type === "CommentLine",
  );
  for (const group of groupAdjacent(lineComments)) {
    const block = group.map((comment) => comment.value.trim()).join("\n");
    const blockLine = lineOf(group[0]);
    for (const comment of group) {
      result.push({
        line: lineOf(comment),
        text: comment.value.trim(),
        kind: "plain",
        block,
        blockLine,
      });
    }
  }

  const blockComments = comments.filter(
    (comment) => comment.type === "CommentBlock",
  );
  for (const comment of blockComments) {
    const kind =
      comment === blockComments[0] && comment.value.includes(LICENCE)
        ? "licence"
        : comment.value.startsWith("*")
          ? "doc"
          : "plain";
    const blockLine = lineOf(comment);
    const lines = comment.value
      .split("\n")
      .map((raw) => raw.replace(/^\s*\*?\s?/, "").trim());
    const block = lines.join("\n");
    lines.forEach((text, index) => {
      result.push({ line: blockLine + index, text, kind, block, blockLine });
    });
  }

  return result.sort((a, b) => a.line - b.line);
};

const LICENCE = "GNU General Public License";

type Located = { loc?: { start: { line: number } } | null };

const lineOf = (comment: Located | undefined) => comment?.loc?.start.line ?? 0;

/** Babel's plugins for a file, chosen by its extension. */
export const selectPlugins = (path: string): ParserPlugin[] =>
  path.endsWith(".ts")
    ? ["typescript"]
    : path.endsWith(".tsx")
      ? ["typescript", "jsx"]
      : ["jsx"];

const groupAdjacent = <T extends Located>(comments: T[]): T[][] => {
  const groups: T[][] = [];
  for (const comment of comments) {
    const group = groups.at(-1);
    if (group && lineOf(group.at(-1)) + 1 === lineOf(comment)) {
      group.push(comment);
    } else {
      groups.push([comment]);
    }
  }
  return groups;
};
