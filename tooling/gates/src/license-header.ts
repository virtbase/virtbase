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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const author = "BeastHost UG (haftungsbeschränkt)";

export const agplNotice: readonly string[] = [
  "This program is free software: you can redistribute it and/or modify",
  "it under the terms of the GNU Affero General Public License as published",
  "by the Free Software Foundation, either version 3 of the License, or",
  "(at your option) any later version.",
  "",
  "This program is distributed in the hope that it will be useful,",
  "but WITHOUT ANY WARRANTY; without even the implied warranty of",
  "MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the",
  "GNU Affero General Public License for more details.",
  "",
  "You should have received a copy of the GNU Affero General Public License",
  "along with this program.  If not, see <https://www.gnu.org/licenses/>.",
];

const notices: Record<string, readonly string[]> = {
  "AGPL-3.0-or-later": ["", ...agplNotice],
  MIT: ["SPDX-License-Identifier: MIT"],
};

export function headerFor(license: string, year: number): string {
  const notice = notices[license];
  if (notice === undefined) throw new Error(`No header for ${license}.`);
  const lines = [`Copyright (C) ${year} ${author}`, ...notice];
  const body = lines.map((line) => (line === "" ? " *" : ` * ${line}`));
  return `/*\n${body.join("\n")}\n */\n`;
}

const source = /\.(?:ts|tsx|js|mjs|css)$/;

const excluded: readonly RegExp[] = [
  /\.d\.ts$/,
  /\.(?:test|spec)\.[^/]+$/,
  /\.config\.[^/]+$/,
  /(?:^|\/)(?:e2e|dist|\.next|node_modules)\//,
];

export function needsHeader(path: string): boolean {
  return source.test(path) && !excluded.some((pattern) => pattern.test(path));
}

const header = /^(?:#![^\n]*\n)?(\/\*[\s\S]*?\*\/\n)/;

export function leadingHeader(content: string): string | undefined {
  const block = header.exec(content)?.[1];
  return block?.includes("Copyright (C)") ? block : undefined;
}

export function addHeader(content: string, block: string): string {
  if (leadingHeader(content) !== undefined) return content;
  const shebang = /^#![^\n]*\n/.exec(content)?.[0] ?? "";
  const rest = content.slice(shebang.length).replace(/^\n+/, "");
  return rest === "" ? `${shebang}${block}` : `${shebang}${block}\n${rest}`;
}

export function licenseOf(file: string, root: string): string {
  let folder = dirname(resolve(file));
  const top = resolve(root);
  for (;;) {
    const manifest = join(folder, "package.json");
    if (existsSync(manifest)) {
      const { license } = JSON.parse(readFileSync(manifest, "utf8")) as {
        license?: unknown;
      };
      if (typeof license === "string") return license;
    }
    if (folder === top || dirname(folder) === folder) {
      throw new Error(`No package.json with a license above ${file}.`);
    }
    folder = dirname(folder);
  }
}

export function applyHeaders(
  files: readonly string[],
  root: string,
  year: number,
): string[] {
  const changed: string[] = [];
  for (const file of files) {
    const target = resolve(root, file);
    const path = relative(root, target).split(sep).join("/");
    if (!needsHeader(path) || !existsSync(target)) continue;
    const content = readFileSync(target, "utf8");
    const next = addHeader(content, headerFor(licenseOf(target, root), year));
    if (next !== content) {
      writeFileSync(target, next);
      changed.push(path);
    }
  }
  return changed;
}

if (import.meta.main) {
  applyHeaders(process.argv.slice(2), process.cwd(), new Date().getFullYear());
}
