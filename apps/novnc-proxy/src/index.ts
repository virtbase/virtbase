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
 * The entrypoint, and the executable's command line:
 *
 *   novnc-proxy              serve consoles
 *   novnc-proxy healthcheck  exit 0 if the proxy on PORT answers, 1 if not
 *
 * The image has no shell and no curl, so the executable is its own Docker
 * `HEALTHCHECK`. Nothing here awaits at the top level, which `--bytecode`
 * builds do not allow.
 */

import * as z from "zod";
import { ConfigSchema, PortSchema } from "./config";
import { log } from "./log";
import { startServer } from "./server";

/** Inside the 5s Docker gives a `HEALTHCHECK` before counting it as failed. */
const HEALTHCHECK_TIMEOUT_MS = 3_000;

// A declaration rather than an arrow function, so that TypeScript knows
// nothing runs after a call to it.
function fail(message: string): never {
  log("error", message);
  return process.exit(1);
}

const serve = (): void => {
  const config = ConfigSchema.safeParse(process.env);
  if (!config.success) {
    fail(`Invalid configuration:\n${z.prettifyError(config.error)}`);
  }

  const { server, shutdown } = startServer(config.data);
  log("info", `Listening on port ${server.port}`);

  // SIGTERM is what `docker stop` sends.
  const stop = (signal: NodeJS.Signals): void => {
    log("info", `${signal} received, closing open consoles`);
    void shutdown().then(() => process.exit(0));
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
};

const healthcheck = async (): Promise<never> => {
  const port = PortSchema.safeParse(process.env.PORT);
  if (!port.success) {
    return fail(`Invalid PORT:\n${z.prettifyError(port.error)}`);
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port.data}/api/status`, {
      signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
    });
    return response.ok
      ? process.exit(0)
      : fail(`Unhealthy: status ${response.status}`);
  } catch (error) {
    return fail(`Unhealthy: ${String(error)}`);
  }
};

// `Bun.argv` is `[bun, entrypoint, ...args]` under `bun run` and in the
// compiled executable alike.
const args = Bun.argv.slice(2);

if (args.length === 0) {
  serve();
} else if (args.length === 1 && args[0] === "healthcheck") {
  void healthcheck();
} else {
  fail(`Unknown command "${args.join(" ")}"; expected none or "healthcheck"`);
}
