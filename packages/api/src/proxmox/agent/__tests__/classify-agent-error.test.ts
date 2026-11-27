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
import { ProxmoxEngine } from "@virtbase/proxmox-api";
import { classifyAgentError } from "../classify-agent-error.ts";

const PATH = "/api2/json/nodes/n1/qemu/100/agent/exec";

/**
 * The error the real client throws for one `fetch` outcome.
 *
 * Built by a real `ProxmoxEngine` rather than by hand, so these tests follow
 * whatever the client does with a response instead of a copy of its message
 * format - which is exactly what went stale when the client moved to typed
 * errors.
 */
const thrownBy = async (
  respond: () => Response | Promise<Response>,
): Promise<unknown> => {
  const engine = new ProxmoxEngine({
    host: "node.example",
    tokenID: "api@pve!virtbase",
    tokenSecret: "f7d62f02-eb10-413e-b8f1-6dd8a9902885",
    maxRetries: 0,
    fetch: async () => respond(),
  });

  try {
    await engine.doRequest("POST", PATH, PATH, { command: "true" });
  } catch (error) {
    return error;
  }

  throw new Error("expected the request to fail");
};

/** How PVE 9 answers a failed API call: the reason in the body and the status line. */
const pveError = (status: number, message: string) =>
  thrownBy(
    () =>
      new Response(JSON.stringify({ data: null, message: `${message}\n` }), {
        status,
        statusText: message,
        headers: { "content-type": "application/json;charset=UTF-8" },
      }),
  );

describe("classifyAgentError", () => {
  test("it reports a stopped or missing agent as unreachable", async () => {
    const reasons = [
      "No QEMU guest agent configured",
      "QEMU guest agent is not running",
      "VM 100 is not running",
      "VM 100 qmp command 'guest-ping' failed - got timeout",
    ];

    for (const reason of reasons) {
      const result = classifyAgentError(await pveError(500, reason));

      expect(result.status).toBe("agent_unreachable");
    }
  });

  test("it reports a blocked guest-exec as disabled rather than unreachable", async () => {
    const result = classifyAgentError(
      await pveError(
        500,
        "VM 100 qmp command 'guest-exec' failed - The command guest-exec has been disabled for this instance",
      ),
    );

    expect(result.status).toBe("exec_disabled");
  });

  test("it reports an agent too old for guest-exec as disabled", async () => {
    const result = classifyAgentError(
      await pveError(
        500,
        "VM 100 qmp command 'guest-exec' failed - The command guest-exec has not been found",
      ),
    );

    expect(result.status).toBe("exec_disabled");
  });

  test("it reports a token without VM.GuestAgent.Unrestricted as permission denied", async () => {
    expect(
      classifyAgentError(
        await pveError(
          403,
          "Permission check failed (/vms/100, VM.GuestAgent.Unrestricted)",
        ),
      ).status,
    ).toBe("permission_denied");
    expect(
      classifyAgentError(await pveError(401, "authentication failure")).status,
    ).toBe("permission_denied");
  });

  test("it reports a transport failure, which carries no status, as an error", async () => {
    const result = classifyAgentError(
      await thrownBy(() => {
        throw new TypeError("fetch failed", {
          cause: new Error("connect ETIMEDOUT"),
        });
      }),
    );

    expect(result.status).toBe("error");
  });

  test("it reports a 400 as an error rather than an agent problem", async () => {
    const result = classifyAgentError(
      await pveError(400, "Parameter verification failed."),
    );

    expect(result.status).toBe("error");
  });

  test("it keeps the original message for logs", async () => {
    const result = classifyAgentError(
      await pveError(
        403,
        "Permission check failed (/vms/100, VM.GuestAgent.Unrestricted)",
      ),
    );

    expect(result.message).toContain("403");
    expect(result.message).toContain("VM.GuestAgent.Unrestricted");
  });

  test("it ignores a status-like number that is only in the text", () => {
    expect(
      classifyAgentError(new Error("upstream said 500 Internal Server Error"))
        .status,
    ).toBe("error");
  });

  test("it survives a thrown non-Error", () => {
    expect(classifyAgentError("boom").status).toBe("error");
    expect(classifyAgentError(undefined).status).toBe("error");
  });
});
