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

import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/**
 * A Markdown node as `typst/lib/markdown.typ` reads it: the mdast node with
 * only the fields the renderer uses, so the JSON stays small and positions or
 * plugin data never reach Typst.
 */
export interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number;
  url?: string;
  lang?: string | null;
  align?: (string | null)[];
}

/** Node types the renderer has an element for. */
const SUPPORTED = new Set([
  "root",
  "blockquote",
  "heading",
  "paragraph",
  "list",
  "listItem",
  "table",
  "tableRow",
  "tableCell",
  "code",
  "thematicBreak",
  "text",
  "strong",
  "emphasis",
  "delete",
  "inlineCode",
  "break",
  "link",
]);

export class UnsupportedMarkdownError extends Error {
  readonly nodeType: string;

  constructor(nodeType: string) {
    super(`Markdown node "${nodeType}" has no PDF form.`);
    this.name = "UnsupportedMarkdownError";
    this.nodeType = nodeType;
  }
}

function convert(node: Nodes, headingOffset: number): MarkdownNode {
  // Raw HTML, images and footnotes would need a decision about how they look
  // in print. Failing here means a document that grows one is noticed, rather
  // than shipped with a hole where the node was.
  if (!SUPPORTED.has(node.type)) throw new UnsupportedMarkdownError(node.type);

  const out: MarkdownNode = { type: node.type };

  switch (node.type) {
    case "heading":
      out.depth = Math.max(1, node.depth - headingOffset);
      break;
    case "list":
      out.ordered = node.ordered === true;
      out.start = node.start ?? 1;
      break;
    case "link":
      out.url = node.url;
      break;
    case "code":
      out.value = node.value;
      out.lang = node.lang ?? null;
      break;
    case "table":
      out.align = node.align ?? [];
      break;
    case "text":
      // A soft line break in the source is a space in the text, as it is in
      // Typst markup. Left in, the newline would break the line in the PDF.
      out.value = node.value.replace(/[ \t]*\n[ \t]*/g, " ");
      break;
    case "inlineCode":
      out.value = node.value;
      break;
    default:
      // Every other supported node is fully described by its type and its
      // children.
      break;
  }

  if ("children" in node) {
    out.children = convertChildren(node.children as Nodes[], headingOffset);
  }

  return out;
}

const LINE_BREAK = /^<br\s*\/?>$/i;
const OPENING = /^<(sup|sub)>$/i;
const CLOSING = /^<\/(sup|sub)>$/i;
const SCRIPT_TYPE = { sup: "superscript", sub: "subscript" } as const;

/**
 * The inline HTML the legal documents use, and nothing else: `<br/>` and
 * `<sup>`/`<sub>` around text, as in "Unzutreffendes streichen<sup>(*)</sup>".
 * mdast keeps an inline tag as a node of its own beside the text it wraps, so
 * the pairs are matched up here among siblings.
 */
function convertChildren(
  children: Nodes[],
  headingOffset: number,
): MarkdownNode[] {
  const root: MarkdownNode[] = [];
  const open: { tag: "sup" | "sub"; children: MarkdownNode[] }[] = [];
  const current = () => open.at(-1)?.children ?? root;

  for (const child of children) {
    if (child.type !== "html") {
      current().push(convert(child, headingOffset));
      continue;
    }

    const value = child.value.trim();
    const opening = OPENING.exec(value)?.[1]?.toLowerCase() as
      | "sup"
      | "sub"
      | undefined;
    const closing = CLOSING.exec(value)?.[1]?.toLowerCase();

    if (LINE_BREAK.test(value)) {
      current().push({ type: "break" });
    } else if (opening) {
      open.push({ tag: opening, children: [] });
    } else if (closing && open.at(-1)?.tag === closing) {
      const done = open.pop();
      if (done) {
        current().push({
          type: SCRIPT_TYPE[done.tag],
          children: done.children,
        });
      }
    } else {
      throw new UnsupportedMarkdownError(`html ${value}`);
    }
  }

  if (open.length > 0) {
    throw new UnsupportedMarkdownError(`html <${open.at(-1)?.tag}> unclosed`);
  }

  return root;
}

function shallowestHeading(node: Nodes): number {
  if (node.type === "heading") return node.depth;
  if (!("children" in node)) return Number.POSITIVE_INFINITY;
  return Math.min(
    Number.POSITIVE_INFINITY,
    ...node.children.map((child) => shallowestHeading(child as Nodes)),
  );
}

/**
 * Parses GitHub-flavoured Markdown into the tree the PDF renderer reads.
 *
 * The shallowest heading becomes a first-level heading. A document's title is
 * set by the layout, so its body usually starts at `##`, and that is the
 * level the layout styles as a section heading.
 */
export function markdownToTree(markdown: string): MarkdownNode {
  const root = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

  const shallowest = shallowestHeading(root);
  const offset = Number.isFinite(shallowest) ? shallowest - 1 : 0;

  return convert(root, offset);
}
