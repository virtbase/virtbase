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
import { runGuestCommand } from "../exec";
import type { ProxmoxVm } from "../types";

interface ExecStatusFrame {
  exited?: boolean | number;
  exitcode?: number;
  signal?: number;
  "out-data"?: string;
  "err-data"?: string;
  "out-truncated"?: boolean | number;
  "err-truncated"?: boolean | number;
}

/**
 * A VM reduced to the two agent calls exec makes. `frames` are returned by
 * successive `exec-status` polls, so a run that only finishes on the third poll
 * is expressed as three frames.
 */
const createVm = ({
  frames,
  onExec,
  execError,
  statusError,
}: {
  frames?: ExecStatusFrame[];
  onExec?: (params: Record<string, unknown>) => void;
  execError?: unknown;
  statusError?: unknown;
}) => {
  let poll = 0;
  const calls = { exec: 0, status: 0 };

  const vm = {
    agent: {
      exec: {
        $post: async (params: Record<string, unknown>) => {
          calls.exec++;
          onExec?.(params);
          if (execError) throw execError;
          return { pid: 4242 };
        },
      },
      "exec-status": {
        $get: async ({ pid }: { pid: number }) => {
          calls.status++;
          if (statusError) throw statusError;
          expect(pid).toBe(4242);
          const frame = frames?.[Math.min(poll, (frames?.length ?? 1) - 1)];
          poll++;
          return frame ?? { exited: 1 };
        },
      },
    },
  } as unknown as ProxmoxVm;

  return { vm, calls };
};

const fast = { pollIntervalMs: 1, timeoutMs: 500 };

describe("runGuestCommand", () => {
  test("it passes argv through as an array and returns the collected output", async () => {
    let seen: Record<string, unknown> | undefined;
    const { vm } = createVm({
      onExec: (params) => {
        seen = params;
      },
      frames: [{ exited: 1, exitcode: 0, "out-data": "hello\n" }],
    });

    const result = await runGuestCommand(vm, ["ss", "-lntup"], fast);

    expect(seen?.command).toEqual(["ss", "-lntup"]);
    expect(result).toEqual({
      status: "ok",
      exitCode: 0,
      signal: null,
      stdout: "hello\n",
      stderr: "",
      truncated: false,
    });
  });

  test("it treats the integer flags Proxmox actually sends as booleans", async () => {
    // Proxmox documents `exited` as a boolean but sends 0/1 - a truthiness bug
    // here would spin until the budget ran out.
    const { vm } = createVm({
      frames: [
        { exited: 0 },
        { exited: 1, exitcode: 0, "out-data": "x", "out-truncated": 1 },
      ],
    });

    const result = await runGuestCommand(vm, ["true"], fast);

    expect(result).toMatchObject({ status: "ok", truncated: true });
  });

  test("it polls until the process exits", async () => {
    const { vm, calls } = createVm({
      frames: [{ exited: 0 }, { exited: 0 }, { exited: 1, exitcode: 0 }],
    });

    const result = await runGuestCommand(vm, ["sleep", "0"], fast);

    expect(result.status).toBe("ok");
    expect(calls.status).toBe(3);
    expect(calls.exec).toBe(1);
  });

  test("it reports a non-zero exit as a successful call", async () => {
    // `ufw status` on a host without ufw exits non-zero; that is an answer.
    const { vm } = createVm({
      frames: [{ exited: 1, exitcode: 127, "err-data": "not found" }],
    });

    const result = await runGuestCommand(vm, ["ufw", "status"], fast);

    expect(result).toMatchObject({
      status: "ok",
      exitCode: 127,
      stderr: "not found",
    });
  });

  test("it reports a signalled process with a null exit code", async () => {
    const { vm } = createVm({ frames: [{ exited: 1, signal: 9 }] });

    const result = await runGuestCommand(vm, ["sleep", "0"], fast);

    expect(result).toMatchObject({ status: "ok", exitCode: null, signal: 9 });
  });

  test("it gives up once the budget is spent", async () => {
    const { vm, calls } = createVm({ frames: [{ exited: 0 }] });

    // A zero budget rather than a short one: this has to assert the deadline
    // logic, not how promptly the runtime fires a timer. Under a loaded event
    // loop a 5ms sleep can take seconds, which made the wall-clock version of
    // this test pass alone and hang in the full suite.
    const result = await runGuestCommand(vm, ["sleep", "60"], {
      pollIntervalMs: 5,
      timeoutMs: 0,
    });

    expect(result.status).toBe("timeout");
    // It still checked before abandoning the process.
    expect(calls.status).toBe(1);
  });

  test("it never sleeps past its own deadline", async () => {
    const { vm } = createVm({ frames: [{ exited: 0 }] });

    const started = Date.now();
    await runGuestCommand(vm, ["sleep", "60"], {
      // A poll interval wider than the budget must not buy the loop extra time.
      pollIntervalMs: 10_000,
      timeoutMs: 50,
    });

    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("it classifies a failure to start the command", async () => {
    const { vm, calls } = createVm({
      execError: new Error(
        "POST https://n/api2/json/x connection failed with 403 Forbidden return: {}",
      ),
    });

    const result = await runGuestCommand(vm, ["ss"], fast);

    expect(result.status).toBe("permission_denied");
    // No pid was handed out, so nothing should have been polled.
    expect(calls.status).toBe(0);
  });

  test("it classifies a failure while polling", async () => {
    const { vm } = createVm({
      statusError: new Error(
        'GET https://n/api2/json/x return Error 500 Internal Server Error: {"errors":"QEMU guest agent is not running"}',
      ),
    });

    const result = await runGuestCommand(vm, ["ss"], fast);

    expect(result.status).toBe("agent_unreachable");
  });

  test("it forwards stdin only when given", async () => {
    let seen: Record<string, unknown> | undefined;
    const { vm } = createVm({
      onExec: (params) => {
        seen = params;
      },
      frames: [{ exited: 1, exitcode: 0 }],
    });

    await runGuestCommand(vm, ["cat"], fast);
    expect(seen).not.toHaveProperty("input-data");

    await runGuestCommand(vm, ["cat"], { ...fast, input: "payload" });
    expect(seen?.["input-data"]).toBe("payload");
  });

  test("it refuses an empty argv", () => {
    const { vm } = createVm({});

    expect(runGuestCommand(vm, [])).rejects.toThrow("argv must not be empty");
  });
});
