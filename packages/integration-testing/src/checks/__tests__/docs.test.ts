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
import { checkDocs, DOCS_FILES } from "../docs";

const templates = Object.fromEntries(
  DOCS_FILES.map((name) => [name, "# T\n\nTODO: write\n"]),
);
const written = Object.fromEntries(
  DOCS_FILES.map((name) => [
    name,
    `# ${name}\n\nA page that says what it has to say.\n`,
  ]),
);

describe("checkDocs", () => {
  test("accepts nine written files", () => {
    expect(checkDocs({ files: written, templates })).toEqual([]);
  });

  test("reports a missing file", () => {
    expect(
      checkDocs({ files: { ...written, "README.md": null }, templates }),
    ).toEqual(["docs/README.md is missing"]);
  });

  test("reports a file no longer than its template", () => {
    expect(
      checkDocs({ files: { ...written, "events.md": "# T" }, templates }),
    ).toEqual(["docs/events.md is no longer than its template"]);
  });

  test("reports a TODO left behind", () => {
    expect(
      checkDocs({
        files: {
          ...written,
          "pages.md":
            "# Pages\n\nTODO: describe the export page and who may open it.\n",
        },
        templates,
      }),
    ).toEqual(["docs/pages.md still holds a TODO placeholder"]);
  });
});
