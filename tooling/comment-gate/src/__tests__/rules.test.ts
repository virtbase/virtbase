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

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { CommentLine } from "../comments";
import { extractCommentLines } from "../comments";
import { findViolations, HEDGES, isCommentedOutCode } from "../rules";

const plain = (text: string, block = text): CommentLine => ({
  line: 1,
  text,
  kind: "plain",
  block,
  blockLine: 1,
});

const violationsIn = (source: string, path = "src/a.ts") => {
  const comments = extractCommentLines(path, source);
  const added = new Set(source.split("\n").map((_, index) => index + 1));
  return findViolations({ path, comments, added }).map(
    ({ line, rule, message }) => [line, rule, message],
  );
};

const rulesFor = (text: string) =>
  violationsIn(`// ${text}`).map(([, rule]) => rule);

describe("HEDGES", () => {
  test("is the CMT-8 list of docs/style/comments.md", async () => {
    const guide = await Bun.file(
      resolve(import.meta.dir, "../../../../docs/style/comments.md"),
    ).text();
    const quote = guide
      .slice(guide.indexOf("**CMT-8"))
      .split("\n")
      .filter((line) => line.startsWith("> "))
      .join(" ");
    const listed = quote
      .replaceAll("> ", "")
      .split(",")
      .map((hedge) => hedge.trim())
      .filter((hedge) => hedge.length > 0);

    expect<string[]>([...HEDGES]).toEqual(listed);
  });
});

describe("findViolations: CMT-8", () => {
  test("reports every hedge, in any case and with any spacing", () => {
    expect(violationsIn("// This should work FOR   NOW, maybe.")).toEqual([
      [
        1,
        "CMT-8",
        '"should" is on the hedge list; state the fact, the requirement or the condition',
      ],
      [
        1,
        "CMT-8",
        '"FOR   NOW" is on the hedge list; state the fact, the requirement or the condition',
      ],
      [
        1,
        "CMT-8",
        '"maybe" is on the hedge list; state the fact, the requirement or the condition',
      ],
    ]);
  });

  test("reports contractions of should and might", () => {
    expect(rulesFor("This shouldn't happen.")).toEqual(["CMT-8"]);
    expect(rulesFor("It mightn’t return.")).toEqual(["CMT-8"]);
  });

  test("reports a phrase wrapped across lines, on its first line", () => {
    expect(violationsIn("// Skips the row for\n// now.")).toEqual([
      [
        1,
        "CMT-8",
        '"for now" is on the hedge list; state the fact, the requirement or the condition',
      ],
    ]);
    expect(violationsIn("/* Waits for the time\n * being. */")).toEqual([
      [
        1,
        "CMT-8",
        '"for the time being" is on the hedge list; state the fact, the requirement or the condition',
      ],
    ]);
  });

  test("passes precise text, identifiers, text in backticks and URLs", () => {
    expect(rulesFor("Never throws: failures are recorded on the row.")).toEqual(
      [],
    );
    expect(rulesFor("Calls shouldRetry before the next attempt.")).toEqual([]);
    expect(rulesFor("Sends the `magic link` email.")).toEqual([]);
    expect(rulesFor("See https://react.dev/learn#temporarily-disable")).toEqual(
      [],
    );
  });
});

describe("findViolations: CMT-10", () => {
  test("allows a TODO only with an issue reference", () => {
    expect(
      rulesFor("TODO(#412): batch the lookups when nodes exceed 50."),
    ).toEqual([]);
    expect(rulesFor("TODO(#412):")).toEqual([]);
    expect(rulesFor("TODO: batch the lookups")).toEqual(["CMT-10"]);
    expect(rulesFor("TODO(412): batch")).toEqual(["CMT-10"]);
  });

  test("passes a TODO in backticks", () => {
    expect(rulesFor("The `TODO` marker names an issue.")).toEqual([]);
  });

  test("never allows FIXME, HACK or XXX, and reports HACK once", () => {
    expect(rulesFor("FIXME broken")).toEqual(["CMT-10"]);
    expect(rulesFor("HACK around it")).toEqual(["CMT-10"]);
    expect(rulesFor("XXX broken")).toEqual(["CMT-10"]);
  });
});

describe("findViolations: CMT-11", () => {
  test("reports commented-out code", () => {
    expect(rulesFor("await sendInvoice(order);")).toEqual(["CMT-11"]);
  });

  test("reports commented-out JSX in a .tsx file", () => {
    expect(
      violationsIn(
        "const A = () => <b>{/* <Button onClick={go} /> */}</b>;",
        "src/a.tsx",
      ).map(([, rule]) => rule),
    ).toEqual(["CMT-11"]);
    expect(rulesFor("<Button onClick={go} />")).toEqual(["CMT-11"]);
  });

  test("never reports a TSDoc comment, whose examples are code", () => {
    expect(violationsIn("/**\n * await run(job);\n */")).toEqual([]);
  });
});

describe("findViolations: scope", () => {
  test("checks only added lines, never the licence header, sorted by line", () => {
    const source = [
      "/*",
      " * You should have received a copy of the GNU General Public License.",
      " */",
      "// This might fail.",
      "// This might fail too.",
    ].join("\n");
    const comments = extractCommentLines("src/a.ts", source);

    expect(
      findViolations({
        path: "src/a.ts",
        comments,
        added: new Set([2, 5, 4]),
      }).map((violation) => violation.line),
    ).toEqual([4, 5]);
  });
});

describe("isCommentedOutCode", () => {
  test("recognises a line, and a line that is code only within its block", () => {
    expect(isCommentedOutCode(plain("const total = sum(items);"))).toBe(true);
    expect(
      isCommentedOutCode(plain("if (ready) {", "if (ready) {\nstart();\n}")),
    ).toBe(true);
    expect(isCommentedOutCode(plain("}", "if (ready) {\nstart();\n}"))).toBe(
      true,
    );
  });

  test("passes prose that parses as an expression", () => {
    expect(isCommentedOutCode(plain("Bounded (CMP-7)"))).toBe(false);
    expect(isCommentedOutCode(plain("Stripe (webhooks)"))).toBe(false);
    expect(isCommentedOutCode(plain("limit = 50"))).toBe(false);
    expect(isCommentedOutCode(plain("Returns null (see ADR 0010)."))).toBe(
      false,
    );
  });

  test("passes quoted code, directives and URLs", () => {
    expect(isCommentedOutCode(plain("`parse(text);`"))).toBe(false);
    expect(
      isCommentedOutCode(
        plain("biome-ignore lint/style/noDefaultExport: Next.js route"),
      ),
    ).toBe(false);
    expect(
      isCommentedOutCode(plain("@ts-expect-error: the type omits it;")),
    ).toBe(false);
    expect(isCommentedOutCode(plain('/ <reference types="bun" />'))).toBe(
      false,
    );
    expect(isCommentedOutCode(plain("See: https://example.com/?a=b;"))).toBe(
      false,
    );
  });
});
