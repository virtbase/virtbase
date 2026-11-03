# @virtbase/pdf

PDFs in the Virtbase design, typeset by [Typst](https://typst.app) through the
native Node compiler of [typst.ts](https://github.com/Myriad-Dreamin/typst.ts).
Every PDF is tagged and exported as PDF/UA-1.

The package has no internal dependencies. Everything a PDF needs - layouts,
fonts, logos and company data - ships in `typst/`.

```ts
import { renderDocument, renderLetter } from "@virtbase/pdf";

const pdf = renderDocument({
  lang: "de",
  title: "Allgemeine Geschäftsbedingungen",
  subject: "AGB für virtuelle Server",
  date: "Stand: 3. November 2026",
  body: { markdown },
});
```

Both functions return the PDF as a `Uint8Array` and throw a `PdfRenderError`
with Typst's diagnostics when the document does not compile.

## Layouts

| Function         | Layout        | First page                                           |
| ---------------- | ------------- | ---------------------------------------------------- |
| `renderDocument` | `vb-document` | letterhead, title, optional `date` line              |
| `renderLetter`   | `vb-letter`   | letterhead, `recipient` address block, `info` block, |
|                  |               | fold marks                                           |

Languages are `de`, `en`, `fr` and `nl`. A language sets hyphenation and
quotes, and picks the localized values in `typst/data/company.yaml`; a new one
needs an entry in `regions` in `typst/lib/virtbase.typ` and a value for every
localized field in that file.

## The body

`body` is either Markdown or Typst:

- **`{ markdown }`** - GitHub-flavoured Markdown, for anything written as
  text, such as the legal pages. It is safe for any input.
- **`{ typst }`** - Typst markup with every element of `virtbase.typ` in scope
  (`vb-table`, `totals`, `note`, …), for what Markdown cannot express. It is
  evaluated as code, so it must never contain untrusted text.

### How Markdown becomes Typst

Markdown is never turned into Typst source. `src/markdown.ts` parses it into an
mdast tree and keeps only the fields the renderer reads; the tree is passed to
Typst as a JSON file and `typst/lib/markdown.typ` maps each node to an element
of the layout. Text from a document is therefore always text: a `#`, `*` or `]`
prints as it is, and nothing has to be escaped.

| Markdown                     | PDF                                              |
| ---------------------------- | ------------------------------------------------ |
| headings                     | the shallowest becomes `=`, the layout's section |
|                              | heading, because the title is set by the layout  |
| lists, `1.` lists            | `list`, `enum` keeping the start number          |
| tables                       | `vb-table`, right-aligned columns as numeric     |
| `>` quote                    | block quote                                      |
| code, inline code            | `raw` in Geist Mono                              |
| `**`, `*`, `~~`, links       | strong, emphasis, strike, link                   |
| hard break (`\`, `<br/>`)    | line break                                       |
| `---` (horizontal rule)      | page break, e.g. before each annex of the DPA    |
| `<sup>`, `<sub>` around text | superscript, subscript                           |

Anything else - images, footnotes, other HTML - throws an
`UnsupportedMarkdownError`. A document that grows one should be noticed rather
than printed with a gap where the node was.

For a fumadocs document, pass the output of `getText("processed")`: MDX
components are already rendered into Markdown there, the same Markdown that is
served to agents.

## Templates

A document that exists only as a PDF - one that is not written as Markdown -
is a template: `typst/documents/<name>/<name>.typ`, with its wording for every
language in a `data.yaml` beside it and every company value read from
`typst/data/company.yaml`. Templates are listed in `PDF_TEMPLATES`.

```ts
renderTemplate("supplier-information", { lang: "fr", date: "…" });
```

| Template               | Content                                               |
| ---------------------- | ----------------------------------------------------- |
| `supplier-information` | company, registration and bank details for purchasing |
|                        | departments (Lieferantenselbstauskunft)               |

A new template needs a folder in `typst/documents/`, its name in
`PDF_TEMPLATES` and wording for all four languages; the tests render every
template in every language.

## Fonts

Geist and Geist Mono are passed to Typst from memory. typst.ts cannot ignore
the fonts installed on the machine the way the Typst CLI can with
`--ignore-system-fonts`, so a render fails on any warning: a font or a glyph
Geist lacks would otherwise be set in whatever the server has installed.

## Running it

The compiler is created once per process. That takes about a second, because
every font is parsed; a render after that takes milliseconds.

The compiler is a native Node-API module, about 50 MB per platform. That is why
the website uses this package only at build time: `apps/web/scripts/legal-pdfs.ts`
renders the legal PDFs into `public/` before `next build`, and no function ever
loads the compiler. Rendering at request time would mean keeping it out of the
bundle (`serverExternalPackages` in Next.js) and shipping `typst/` with the
function, since the files are read at runtime from beside the source.

## Working on the layouts

`typst/` is laid out as a Typst project root, so the Typst CLI works on it too:

```bash
bun run examples           # the fixtures in src/__tests__/fixtures → build/
bun run examples --check   # and validate every PDF against PDF/UA-1 (Docker)
```

The fixtures are the examples of the original layout repository: a document
with every element, letters in German and English, and an invoice. The tests
compile each of them and fail on any warning.

The pinned typst.ts 0.7.0 bundles Typst 0.14.2. The layouts were designed with
Typst 0.15, which is still a release candidate in typst.ts; anything that needs
0.15 fails the tests here.
