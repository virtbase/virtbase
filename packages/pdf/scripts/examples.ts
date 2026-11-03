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

/**
 * Renders the examples into `build/` to look at, the way `build.sh` did in the
 * original repository. `--check` then validates every PDF against PDF/UA-1
 * with veraPDF, which needs Docker.
 *
 *   bun run examples
 *   bun run examples --check
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "../src/compiler.ts";

const fixtures = new URL("../src/__tests__/fixtures/", import.meta.url);
const build = fileURLToPath(new URL("../build/", import.meta.url));

mkdirSync(build, { recursive: true });

for (const name of readdirSync(fixtures).filter((n) => n.endsWith(".typ"))) {
  const { pdf, pages } = compile(readFileSync(new URL(name, fixtures), "utf8"));
  const out = `${build}${name.replace(/\.typ$/, ".pdf")}`;
  writeFileSync(out, pdf);
  console.log(`${out} (${pages} pages)`);
}

if (process.argv.includes("--check")) {
  const verapdf = Bun.spawnSync(
    [
      "docker",
      "run",
      "--rm",
      "-v",
      `${build}:/data`,
      "verapdf/cli:latest",
      "--flavour",
      "ua1",
      "--format",
      "text",
      "/data",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  process.exit(verapdf.exitCode ?? 1);
}
