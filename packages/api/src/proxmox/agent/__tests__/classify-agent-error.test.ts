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
import { classifyAgentError } from "../classify-agent-error";

/** Reproduces the message `ProxmoxEngine` builds for a handled status. */
const engineError = (status: number, statusText: string, body: unknown) =>
  new Error(
    `POST https://node.example/api2/json/nodes/n1/qemu/100/agent/exec return Error ${status} ${statusText}: ${JSON.stringify(body)}`,
  );

/** Reproduces the message it builds for an unhandled status. */
const engineFallbackError = (status: number, statusText: string) =>
  new Error(
    `POST https://node.example/api2/json/nodes/n1/qemu/100/agent/exec connection failed with ${status} ${statusText} return: {}`,
  );

describe("classifyAgentError", () => {
  test("it reports a stopped or missing agent as unreachable", () => {
    const cases = [
      "No QEMU guest agent configured",
      "QEMU guest agent is not running",
      "VM 100 is not running",
      "VM 100 qmp command 'guest-ping' failed - got timeout",
    ];

    for (const body of cases) {
      const result = classifyAgentError(
        engineError(500, "Internal Server Error", { errors: body }),
      );

      expect(result.status).toBe("agent_unreachable");
    }
  });

  test("it reports a blocked guest-exec as disabled rather than unreachable", () => {
    const result = classifyAgentError(
      engineError(500, "Internal Server Error", {
        errors:
          "VM 100 qmp command 'guest-exec' failed - The command guest-exec has been disabled for this instance",
      }),
    );

    expect(result.status).toBe("exec_disabled");
  });

  test("it reports an agent too old for guest-exec as disabled", () => {
    const result = classifyAgentError(
      engineError(500, "Internal Server Error", {
        errors:
          "VM 100 qmp command 'guest-exec' failed - The command guest-exec has not been found",
      }),
    );

    expect(result.status).toBe("exec_disabled");
  });

  test("it reports a token without VM.GuestAgent.Unrestricted as permission denied", () => {
    expect(
      classifyAgentError(engineFallbackError(403, "Forbidden")).status,
    ).toBe("permission_denied");
    expect(
      classifyAgentError(engineError(401, "authentication failure", {})).status,
    ).toBe("permission_denied");
  });

  test("it reports a transport failure, which carries no status, as an error", () => {
    const result = classifyAgentError(
      new Error(
        "FaILED to call POST https://node.example/api2/json/nodes/n1/qemu/100/agent/exec cause by:connect ETIMEDOUT",
      ),
    );

    expect(result.status).toBe("error");
  });

  test("it reports a 400 as an error rather than an agent problem", () => {
    const result = classifyAgentError(
      engineError(400, "Parameter verification failed.", {}),
    );

    expect(result.status).toBe("error");
  });

  test("it keeps the original message for logs", () => {
    const result = classifyAgentError(engineFallbackError(403, "Forbidden"));

    expect(result.message).toContain("403");
  });

  test("it survives a thrown non-Error", () => {
    expect(classifyAgentError("boom").status).toBe("error");
    expect(classifyAgentError(undefined).status).toBe("error");
  });
});
