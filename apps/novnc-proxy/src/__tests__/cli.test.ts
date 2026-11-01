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

import { describe, expect, test } from "bun:test";
import { startServer } from "../server.ts";

/**
 * The entrypoint as the executable runs it: a child process with its own
 * arguments, environment and exit code. `--no-env-file` keeps a stray `.env`
 * from supplying the secret, as the compiled executable's flags do.
 */

const SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ENTRYPOINT = new URL("../index.ts", import.meta.url).pathname;

const spawn = (args: string[], env: Record<string, string>) =>
  Bun.spawn([process.execPath, "--no-env-file", ENTRYPOINT, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });

const run = async (args: string[], env: Record<string, string> = {}) => {
  const child = spawn(args, env);
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stderr };
};

/** A port that was free a moment ago, so nothing answers on it. */
const closedPort = (): number => {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
};

const waitUntilServing = async (port: number): Promise<void> => {
  const deadline = performance.now() + 5_000;
  const serving = () =>
    fetch(`http://127.0.0.1:${port}/api/status`).then(
      (response) => response.ok,
      () => false,
    );
  while (!(await serving())) {
    if (performance.now() > deadline) throw new Error("never started serving");
    await Bun.sleep(20);
  }
};

describe("novnc-proxy", () => {
  test.each([
    [{}, "NOVNC_PROXY_SECRET is not set"],
    [{ NOVNC_PROXY_SECRET: "changeme" }, "64 hex characters"],
  ])("refuses to start with %p", async (env, message) => {
    const { exitCode, stderr } = await run([], env);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(message);
  });

  test("refuses any other command", async () => {
    const { exitCode, stderr } = await run(["serve-forever"], {
      NOVNC_PROXY_SECRET: SECRET,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown command "serve-forever"');
  });

  test.each(["SIGTERM", "SIGINT"] as const)(
    "serves until %s, then exits 0",
    async (signal) => {
      const port = closedPort();
      const child = spawn([], {
        NOVNC_PROXY_SECRET: SECRET,
        PORT: String(port),
      });
      await waitUntilServing(port);

      child.kill(signal);

      expect(await child.exited).toBe(0);
    },
  );
});

describe("novnc-proxy healthcheck", () => {
  test("passes against a running proxy, without the secret", async () => {
    const proxy = startServer({ port: 0, secret: SECRET });
    try {
      const { exitCode } = await run(["healthcheck"], {
        PORT: proxy.server.url.port,
      });

      expect(exitCode).toBe(0);
    } finally {
      await proxy.server.stop(true);
    }
  });

  test("fails when nothing answers", async () => {
    const { exitCode, stderr } = await run(["healthcheck"], {
      PORT: String(closedPort()),
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unhealthy");
  });
});
