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

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test as setup } from "@playwright/test";

const run = promisify(execFile);

/**
 * Named `.setup.ts` rather than `.spec.ts` on purpose: bun's test matcher picks
 * up `*.spec.*`, so a Playwright spec with that suffix would be collected by
 * `bun test` and fail on the missing browser. `.setup.ts` and `.e2e.ts` are both
 * invisible to it.
 *
 * The real work runs in `support/bootstrap.ts` under bun - see the note there
 * for why it cannot run inside this process.
 */
setup("seed the database and mint session cookies", async () => {
  setup.setTimeout(120_000);

  const { stdout, stderr } = await run(
    "bun",
    ["--env-file=../../.env", "e2e/support/bootstrap.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // `packages/db/src/client.ts` only points the Neon driver at the local
        // proxy on :4444 when NODE_ENV is exactly "development". A bare `bun`
        // subprocess inherits no NODE_ENV, so without this the seed dials
        // Neon's cloud endpoint on :443 and fails with
        // "WebSocket connection to 'wss://db.localtest.me/v2' failed".
        NODE_ENV: process.env.NODE_ENV ?? "development",
      },
    },
  );

  if (stdout) console.log(stdout.trim());
  if (stderr) console.error(stderr.trim());
});
