import { describe, expect, test } from "bun:test";
import { locales } from "@/i18n/config.ts";
import { listLegalDocuments, renderLegalDocument } from "../legal-pdfs.ts";

const documents = listLegalDocuments();

describe("legal PDFs", () => {
  test("cover every legal page in every locale", () => {
    const slugs = new Set(documents.map((document) => document.slug));

    expect(slugs.has("terms")).toBe(true);
    expect(documents).toHaveLength(slugs.size * locales.length);
  });

  // A page that uses a component the converter has no print form for fails
  // here, in CI, rather than in the deploy.
  test.each(
    documents.map((document) => [
      `${document.locale}/${document.slug}`,
      document,
    ]),
  )("%s renders", (_, document) => {
    const pdf = renderLegalDocument(document);

    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
  });
});
