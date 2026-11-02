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

import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { MARKDOWN_COMPONENT_NAMES } from "../markdown-component-names.ts";

const CONTENT = resolve(import.meta.dir, "../../../../../../packages/content");

test("every component a document uses has a Markdown form", async () => {
  const known = new Set<string>(MARKDOWN_COMPONENT_NAMES);
  const missing = new Set<string>();

  for (const path of new Bun.Glob("**/*.mdx").scanSync({ cwd: CONTENT })) {
    const source = await Bun.file(resolve(CONTENT, path)).text();
    // Code blocks are shown as written, so a `<Tag>` inside one is not a
    // component.
    const prose = source.replace(/^```[\s\S]*?^```/gm, "");
    for (const [, name] of prose.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
      if (name && !known.has(name)) missing.add(`${path}: <${name}>`);
    }
  }

  // A component missing here reaches agents as raw JSX: add its Markdown form
  // to `markdown-components.tsx` and its name to `markdown-component-names.ts`.
  expect([...missing]).toEqual([]);
});
