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

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NodeError } from "@myriaddreamin/typst-ts-node-compiler";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";

/** The layouts, assets, fonts and company data, as they ship with the package. */
const RESOURCES = fileURLToPath(new URL("../typst/", import.meta.url));

/**
 * The root Typst resolves absolute paths against. It does not exist on disk:
 * every file is mapped in from memory, so `/lib/virtbase.typ` means the same
 * thing here, in the examples and with the Typst CLI run from `typst/`.
 */
const WORKSPACE = "/virtbase-pdf";

/** Files a single render passes in next to the main file, under `/input`. */
export type Inputs = Record<string, unknown>;

export class PdfRenderError extends Error {
  readonly diagnostics: readonly string[];

  constructor(message: string, diagnostics: readonly string[]) {
    super(`${message}\n${diagnostics.join("\n")}`);
    this.name = "PdfRenderError";
    this.diagnostics = diagnostics;
  }
}

let compiler: NodeCompiler | undefined;

/**
 * One compiler per process. Creating it parses every font, which takes the
 * better part of a second; a compile after that takes milliseconds, and the
 * compiler's own cache makes repeated layouts cheaper still.
 */
function getCompiler(): NodeCompiler {
  if (compiler) return compiler;

  const files = readdirSync(RESOURCES, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

  const fontBlobs = files
    .filter((file) => /\.(?:ttf|otf)$/.test(file))
    .map((file) => readFileSync(file));

  const created = NodeCompiler.create({
    workspace: WORKSPACE,
    fontArgs: [{ fontBlobs }],
  });

  for (const file of files) {
    if (/\.(?:ttf|otf)$/.test(file)) continue;
    const path = file.slice(RESOURCES.length).split("\\").join("/");
    created.mapShadow(`${WORKSPACE}/${path}`, readFileSync(file));
  }

  compiler = created;
  return created;
}

function describe(error: NodeError | null): string[] {
  return (error?.shortDiagnostics ?? []).map((diagnostic: unknown) => {
    const { message, path } = diagnostic as { message?: string; path?: string };
    return path ? `${path}: ${message}` : String(message);
  });
}

export interface CompileResult {
  pdf: Uint8Array;
  pages: number;
}

/**
 * Compiles a Typst main file against the bundled resources and exports it as
 * PDF/UA-1.
 *
 * Warnings fail the render as errors do. The one that matters is a missing
 * font or glyph: typst.ts has no `--ignore-system-fonts`, so a character Geist
 * lacks would otherwise be set in whatever the machine happens to have
 * installed, and the same document would look different on Vercel.
 */
export function compile(
  main: string | { path: string },
  {
    inputs = {},
    sysInputs,
    createdAt,
  }: {
    inputs?: Inputs;
    /** Strings the document reads with `sys.inputs`, as `--input` does. */
    sysInputs?: Record<string, string>;
    createdAt?: Date | undefined;
  } = {},
): CompileResult {
  const typst = getCompiler();
  const mapped = Object.keys(inputs).map(
    (name) => `${WORKSPACE}/input/${name}`,
  );

  try {
    for (const [name, value] of Object.entries(inputs)) {
      typst.mapShadow(
        `${WORKSPACE}/input/${name}`,
        Buffer.from(JSON.stringify(value)),
      );
    }

    // A document from `typst/documents/` is compiled from its own path, so
    // that files it reads relative to itself, such as its `data.yaml`, resolve.
    const result = typst.compile({
      ...(typeof main === "string"
        ? { mainFileContent: main }
        : { mainFilePath: `${WORKSPACE}/${main.path}` }),
      ...(sysInputs ? { inputs: sysInputs } : {}),
    });
    const document = result.result;
    const error = result.takeError();
    if (!document || error) {
      throw new PdfRenderError(
        "The document did not compile.",
        describe(error),
      );
    }

    const warnings = describe(result.takeWarnings());
    if (warnings.length > 0) {
      throw new PdfRenderError(
        "The document compiled with warnings.",
        warnings,
      );
    }

    const pdf = typst.pdf(document, {
      pdfStandard: "ua-1",
      ...(createdAt
        ? { creationTimestamp: Math.floor(createdAt.getTime() / 1000) }
        : {}),
    });

    return { pdf: new Uint8Array(pdf), pages: document.numOfPages };
  } finally {
    // Synchronous from mapping to export, so no other render can see these.
    for (const path of mapped) typst.unmapShadow(path);
    typst.evictCache(10);
  }
}
