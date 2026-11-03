import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compile, PdfRenderError } from "../compiler.ts";
import type { PdfLanguage } from "../render.ts";
import {
  isPdfTemplate,
  PDF_TEMPLATES,
  renderDocument,
  renderLetter,
  renderTemplate,
} from "../render.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);

/** Every fixture is a complete Typst main file using the layouts directly. */
const fixtures = readdirSync(FIXTURES).filter((name) => name.endsWith(".typ"));

const isPdf = (bytes: Uint8Array) =>
  new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";

const SAMPLE = `
## Scope

Text with **strong**, *emphasis*, \`code\` and a [link](https://virtbase.com).

1. First\\
   a) sub-item
2. Second

- one
- two

| Service | Price |
| --- | ---: |
| VPS | 3,35 € |

> A quote.

---

### Detail

Characters Typst would read as markup: # * _ $ < > @ [ ] \\ // ~ = +
`;

describe("the examples", () => {
  test.each(fixtures)("%s compiles without warnings", (name) => {
    const source = readFileSync(new URL(name, FIXTURES), "utf8");
    const { pdf, pages } = compile(source);

    expect(isPdf(pdf)).toBe(true);
    expect(pages).toBeGreaterThan(0);
  });
});

describe("renderDocument", () => {
  test.each<PdfLanguage>(["de", "en", "fr", "nl"])(
    "renders Markdown in %s",
    (lang) => {
      const pdf = renderDocument({
        lang,
        title: "Title",
        subject: "Subject",
        date: "3.11.2026",
        body: { markdown: SAMPLE },
      });

      expect(isPdf(pdf)).toBe(true);
    },
  );

  test("takes a title that would be code in Typst source", () => {
    const pdf = renderDocument({
      lang: "de",
      title: 'Ein "Titel" mit #let x = 1 und ]',
      body: { markdown: "Text." },
    });

    expect(isPdf(pdf)).toBe(true);
  });

  test("evaluates a Typst body with the layout's elements in scope", () => {
    const pdf = renderDocument({
      lang: "en",
      title: "Totals",
      body: { typst: "#totals(([Net], [8,35]), ([Total], [9,94]))" },
    });

    expect(isPdf(pdf)).toBe(true);
  });

  test("is reproducible with a fixed creation date", () => {
    const options = {
      lang: "de" as const,
      title: "Stable",
      body: { markdown: SAMPLE },
      createdAt: new Date("2026-11-03T00:00:00Z"),
    };

    expect(renderDocument(options)).toEqual(renderDocument(options));
  });

  test("fails on a Typst error instead of returning a PDF", () => {
    expect(() =>
      renderDocument({
        lang: "de",
        title: "Broken",
        body: { typst: "#undefined-function()" },
      }),
    ).toThrow(PdfRenderError);
  });

  test("fails on a warning, such as a font it does not ship", () => {
    expect(() =>
      renderDocument({
        lang: "de",
        title: "Font",
        body: { typst: '#text(font: "Comic Sans MS")[Hallo]' },
      }),
    ).toThrow(PdfRenderError);
  });
});

describe("renderLetter", () => {
  test("renders the address and info blocks", () => {
    const pdf = renderLetter({
      lang: "nl",
      title: "Opzegging",
      recipient: ["Voorbeeld B.V.", "Straat 1", "1234 AB Amsterdam"],
      info: [["Datum", "3-11-2026"]],
      body: { markdown: "Geachte heer, mevrouw,\n\nTekst." },
    });

    expect(isPdf(pdf)).toBe(true);
  });
});

describe("renderTemplate", () => {
  const cases = PDF_TEMPLATES.flatMap((template) =>
    (["de", "en", "fr", "nl"] as const).map(
      (lang) => [template, lang] as const,
    ),
  );

  test.each(cases)("renders %s in %s", (template, lang) => {
    const pdf = renderTemplate(template, { lang, date: "3.11.2026" });

    expect(isPdf(pdf)).toBe(true);
  });

  test("knows its templates by name", () => {
    expect(isPdfTemplate("supplier-information")).toBe(true);
    expect(isPdfTemplate("terms")).toBe(false);
  });
});
