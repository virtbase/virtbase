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

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { runRollbacks } from "../run-rollbacks";

let errors: string[];
let consoleError: ReturnType<typeof spyOn>;

beforeEach(() => {
  errors = [];
  consoleError = spyOn(console, "error").mockImplementation(
    (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    },
  );
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("runRollbacks", () => {
  test("it unwinds the stack newest first", async () => {
    const ran: string[] = [];

    await runRollbacks(
      [
        async () => {
          ran.push("first-pushed");
        },
        async () => {
          ran.push("second-pushed");
        },
        async () => {
          ran.push("third-pushed");
        },
      ],
      "testWorkflow",
    );

    expect(ran).toEqual(["third-pushed", "second-pushed", "first-pushed"]);
  });

  test("a compensation that throws does not skip the ones beneath it", async () => {
    // The whole reason this helper exists. Rollbacks run newest-first, and the
    // newest ones touch the node that just broke the workflow - so they are the
    // most likely to throw. A bare loop would turn that into a permanent
    // orphan: the VM never destroyed, the row and its allocations never
    // removed, because the throw skipped every earlier compensation.
    const ran: string[] = [];

    await runRollbacks(
      [
        async () => {
          ran.push("destroy-guest");
        },
        async () => {
          ran.push("free-disk");
        },
        async () => {
          throw new Error("proxmox is unreachable");
        },
      ],
      "provisionServerWorkflow",
    );

    expect(ran).toEqual(["free-disk", "destroy-guest"]);
  });

  test("it keeps going when every compensation fails", async () => {
    let attempts = 0;

    await runRollbacks(
      Array.from({ length: 3 }, () => async () => {
        attempts++;
        throw new Error("still unreachable");
      }),
      "changeTempalateWorkflow",
    );

    expect(attempts).toBe(3);
  });

  test("it reports the compensations it could not carry out", async () => {
    await runRollbacks(
      [
        async () => {
          /* succeeds */
        },
        async () => {
          throw new Error("proxmox is unreachable");
        },
      ],
      "restoreServerBackupWorkflow",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("restoreServerBackupWorkflow");
    expect(errors[0]).toContain("Rollback 1/2");
    expect(errors[0]).toContain("proxmox is unreachable");
  });

  test("it leaves the caller's stack in the order it was built", async () => {
    // `Array.prototype.reverse` mutates. A workflow that is replayed has to see
    // the stack it pushed, not the stack an earlier failure turned inside out.
    const first = async () => {};
    const second = async () => {};
    const rollbacks = [first, second];

    await runRollbacks(rollbacks, "upgradeServerWorkflow");

    expect(rollbacks).toEqual([first, second]);
  });

  test("an empty stack is not an error", async () => {
    await runRollbacks([], "extendServerWorkflow");

    expect(errors).toEqual([]);
  });
});
