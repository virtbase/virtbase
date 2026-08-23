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

import type { ReactNode } from "react";
import { isValidElement } from "react";

/**
 * Flattens rendered MDX back to plain text.
 *
 * Structured data needs strings, but MDX hands components a React tree. This
 * walks that tree and keeps the text, so an answer written as Markdown — links
 * and emphasis included — can also be serialized into JSON-LD without the
 * prose being written a second time.
 *
 * Only text is preserved. An element that renders text from something other
 * than its children (an icon, an image's alt text) contributes nothing, which
 * is the right answer for structured data.
 */
export function toPlainText(node: ReactNode): string {
  return collect(node).replace(/\s+/g, " ").trim();
}

function collect(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string") {
    return node;
  }

  if (typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(collect).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    const text = collect(node.props.children);

    // Two adjacent paragraphs must not run together into one word, while an
    // inline element must not push a space in front of the punctuation that
    // follows it. Only intrinsic block tags get the separator; a component
    // (which is what the MDX components map turns `a` into) counts as inline.
    return typeof node.type === "string" && BLOCK_ELEMENTS.has(node.type)
      ? `${text} `
      : text;
  }

  return "";
}

const BLOCK_ELEMENTS = new Set([
  "address",
  "blockquote",
  "div",
  "dd",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);
