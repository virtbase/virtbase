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

/**
 * Turns the site's distro SVGs into the emoji uploaded to the Discord app.
 *
 * Writes two things, both committed:
 *
 * - `assets/emoji/*.png`, so the artwork is reviewable in a diff, and
 * - `src/emoji/images.generated.ts`, the base64 the reconciler actually uploads.
 *
 * The generated module exists because this package is reachable from the
 * composition root, and therefore from every page of the web app. Reading a PNG
 * from disk at runtime would put `node:fs` and a `new URL(…, import.meta.url)`
 * into that import graph, which the Next bundler resolves statically and fails
 * on. Embedding the bytes removes the filesystem from the runtime entirely.
 *
 * Run by hand when the distro artwork changes. Nothing rasterizes at runtime —
 * a headless browser has no business inside an interaction handler.
 *
 * ===== Usage =====
 * bun run discord:emojis
 *
 * @see https://docs.discord.com/developers/resources/emoji
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { EMOJI_MANIFEST } from "../src/emoji/manifest";

/** Discord renders emoji small; 128px is the size it asks for. */
const SIZE = 128;

/** Discord's hard ceiling for an emoji image. */
const MAX_BYTES = 256 * 1024;

const SOURCE_DIR = fileURLToPath(
  new URL("../../../apps/web/public/assets/static/distros/", import.meta.url),
);
const OUTPUT_DIR = fileURLToPath(new URL("../assets/emoji/", import.meta.url));
const GENERATED = fileURLToPath(
  new URL("../src/emoji/images.generated.ts", import.meta.url),
);

const LICENSE = `/*
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
`;

/**
 * The page each icon is drawn on.
 *
 * `object-fit: contain` keeps a wide logo from being stretched, and the
 * transparent background is what lets Discord composite the emoji onto both
 * its light and dark themes.
 */
const page = (dataUri: string) => `
<!doctype html>
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { width: ${SIZE}px; height: ${SIZE}px; display: grid; place-items: center; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
<img src="${dataUri}">
`;

async function main() {
  const files = (await readdir(SOURCE_DIR))
    .filter((file) => file.endsWith(".svg"))
    // Wordmarks are a logo plus the distro's name set in type; at 128px the
    // type is unreadable and the mark is squeezed. Only the marks are useful.
    .filter((file) => !file.includes("_wordmark"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No SVGs found in ${SOURCE_DIR}`);
  }

  const images = new Map<string, string>();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: SIZE, height: SIZE },
    deviceScaleFactor: 1,
  });
  const tab = await context.newPage();

  try {
    for (const file of files) {
      const name = basename(file, ".svg");
      const svg = await readFile(join(SOURCE_DIR, file), "utf8");
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

      await tab.setContent(page(dataUri), { waitUntil: "load" });
      const png = await tab.screenshot({ omitBackground: true, type: "png" });

      if (png.byteLength > MAX_BYTES) {
        throw new Error(
          `${name}.png is ${png.byteLength} bytes, over Discord's ${MAX_BYTES} limit`,
        );
      }

      await writeFile(join(OUTPUT_DIR, `${name}.png`), png);
      images.set(
        `${name}.png`,
        `data:image/png;base64,${png.toString("base64")}`,
      );

      console.log(`  ${name}.png (${png.byteLength} bytes)`);
    }
  } finally {
    await browser.close();
  }

  const missing = EMOJI_MANIFEST.filter((entry) => !images.has(entry.file));
  if (missing.length > 0) {
    throw new Error(
      `The manifest declares artwork that does not exist: ${missing
        .map((entry) => entry.file)
        .join(", ")}`,
    );
  }

  // Keyed by the `file` in the manifest, so the reconciler looks an image up by
  // the same name the descriptor declares.
  const entries = [...images.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, data]) => `  "${file}": "${data}",`)
    .join("\n");

  await writeFile(
    GENERATED,
    `${LICENSE}
/**
 * Generated by \`scripts/rasterize-emojis.ts\`. Do not edit.
 *
 * The emoji images as data URIs, keyed by the \`file\` in the manifest.
 * Embedded rather than read from disk so that this package carries no
 * filesystem access into the web app's import graph — see the script's own
 * comment for why that matters.
 */
export const EMOJI_IMAGES: Record<string, string> = {
${entries}
};
`,
  );

  console.log(`\nWrote ${files.length} emoji to ${OUTPUT_DIR}`);
  console.log(`Wrote ${GENERATED}`);
}

await main();
