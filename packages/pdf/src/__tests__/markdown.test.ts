import { describe, expect, test } from "bun:test";
import { markdownToTree, UnsupportedMarkdownError } from "../markdown.ts";

describe("markdownToTree", () => {
  test("makes the shallowest heading a first-level heading", () => {
    const tree = markdownToTree("## Scope\n\n### Detail\n\n#### Deeper");

    expect(tree.children?.map((node) => node.depth)).toEqual([1, 2, 3]);
  });

  test("keeps headings as they are when the body starts at #", () => {
    const tree = markdownToTree("# One\n\n## Two");

    expect(tree.children?.map((node) => node.depth)).toEqual([1, 2]);
  });

  test("turns a soft line break into a space", () => {
    const tree = markdownToTree("first line\nsecond line");

    expect(tree.children?.[0]?.children?.[0]?.value).toBe(
      "first line second line",
    );
  });

  test("keeps a hard line break as a break node", () => {
    const tree = markdownToTree("Street 1\\\n12345 City");

    expect(tree.children?.[0]?.children?.map((node) => node.type)).toEqual([
      "text",
      "break",
      "text",
    ]);
  });

  test("keeps the start of an ordered list and the alignment of a table", () => {
    const tree = markdownToTree(
      "3. three\n4. four\n\n| Item | Price |\n| --- | ---: |\n| A | 1,00 |",
    );
    const [list, table] = tree.children ?? [];

    expect(list).toMatchObject({ type: "list", ordered: true, start: 3 });
    expect(table).toMatchObject({ type: "table", align: [null, "right"] });
  });

  test("leaves no positions in the tree", () => {
    const tree = markdownToTree("**bold** and [a link](https://virtbase.com)");

    expect(JSON.stringify(tree)).not.toContain("position");
    expect(tree.children?.[0]?.children?.[2]).toMatchObject({
      type: "link",
      url: "https://virtbase.com",
    });
  });

  test("turns <br/> into a break and pairs <sup> around text", () => {
    const tree = markdownToTree("Mail<br/>\nwiderrufe(n) ich <sup>(\\*)</sup>");
    const types = tree.children?.[0]?.children?.map((node) => node.type);

    expect(types).toEqual(["text", "break", "text", "superscript"]);
    expect(tree.children?.[0]?.children?.[3]?.children?.[0]?.value).toBe("(*)");
  });

  test("refuses any other HTML", () => {
    expect(() => markdownToTree("<div>raw</div>")).toThrow(
      UnsupportedMarkdownError,
    );
    expect(() => markdownToTree("text <sup>unclosed")).toThrow(
      UnsupportedMarkdownError,
    );
  });

  test("refuses images, which have no print form yet", () => {
    expect(() => markdownToTree("![alt](./image.webp)")).toThrow(
      UnsupportedMarkdownError,
    );
  });
});
