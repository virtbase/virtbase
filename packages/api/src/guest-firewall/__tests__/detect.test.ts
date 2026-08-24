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
import type { ProxmoxVm } from "../../proxmox/agent";
import { DETECT_SCRIPT, shell } from "../commands";
import { detectGuestFirewalls, parseDetectionOutput } from "../detect";
import { readGuestFirewallRules } from "../read-rules";
import { readListeningSockets } from "../read-sockets";

/** A VM whose guest-exec returns fixed output for any command. */
const createVm = ({
  stdout = "",
  exitCode = 0,
  execError,
  onCommand,
}: {
  stdout?: string;
  exitCode?: number;
  execError?: unknown;
  onCommand?: (argv: string[]) => void;
} = {}) =>
  ({
    agent: {
      exec: {
        $post: async ({ command }: { command: string[] }) => {
          onCommand?.(command);
          if (execError) throw execError;
          return { pid: 1 };
        },
      },
      "exec-status": {
        $get: async () => ({
          exited: 1,
          exitcode: exitCode,
          "out-data": stdout,
        }),
      },
    },
  }) as unknown as ProxmoxVm;

describe("parseDetectionOutput", () => {
  test("it reads presence and activity per manager", () => {
    const detection = parseDetectionOutput(
      ["ufw present", "ufw active", "iptables present"].join("\n"),
    );

    expect(detection.managers).toEqual([
      { manager: "ufw", present: true, active: true },
      { manager: "iptables", present: true, active: false },
    ]);
  });

  test("it prefers the front end over the backend it compiles to", () => {
    // A server running ufw has nft rules too, because ufw generated them.
    // Reporting nftables here would show the customer six statements they never
    // wrote instead of the one rule they did.
    const detection = parseDetectionOutput(
      [
        "ufw present",
        "ufw active",
        "nftables present",
        "nftables active",
        "iptables present",
        "iptables active",
      ].join("\n"),
    );

    expect(detection.primary).toBe("ufw");
  });

  test("it falls through the precedence when no front end is active", () => {
    const detection = parseDetectionOutput(
      ["ufw present", "nftables present", "nftables active"].join("\n"),
    );

    expect(detection.primary).toBe("nftables");
  });

  test("it reports nothing filtering when only tooling is installed", () => {
    const detection = parseDetectionOutput(
      ["ufw present", "iptables present"].join("\n"),
    );

    expect(detection.primary).toBeNull();
    expect(detection.managers.every((entry) => !entry.active)).toBe(true);
  });

  test("it orders managers by precedence, not by output order", () => {
    const detection = parseDetectionOutput(
      ["iptables present", "ufw present"].join("\n"),
    );

    expect(detection.managers.map((entry) => entry.manager)).toEqual([
      "ufw",
      "iptables",
    ]);
  });

  test("it treats an active manager as present even without the present line", () => {
    const detection = parseDetectionOutput("firewalld active");

    expect(detection.managers).toEqual([
      { manager: "firewalld", present: true, active: true },
    ]);
  });

  test("it ignores lines it does not recognise", () => {
    const detection = parseDetectionOutput(
      ["sh: warning: something", "ufw present", "totally unrelated"].join("\n"),
    );

    expect(detection.managers).toHaveLength(1);
  });

  test("it handles empty output", () => {
    expect(parseDetectionOutput("")).toEqual({ managers: [], primary: null });
  });
});

describe("detectGuestFirewalls", () => {
  test("it runs the detection script through a shell", () => {
    let argv: string[] | undefined;
    const vm = createVm({
      stdout: "ufw present\nufw active\n",
      onCommand: (command) => {
        argv = command;
      },
    });

    return detectGuestFirewalls(vm).then((detection) => {
      expect(argv).toEqual([...shell(DETECT_SCRIPT)]);
      expect(detection.primary).toBe("ufw");
      expect(detection.failure).toBeNull();
    });
  });

  test("it reports a missing agent instead of an empty result", async () => {
    // "We could not look" and "we looked and found nothing" mean very different
    // things to show a customer, so they must stay distinguishable.
    const vm = createVm({
      execError: new Error(
        'POST https://n/x return Error 500 Internal Server Error: {"errors":"No QEMU guest agent configured"}',
      ),
    });

    const detection = await detectGuestFirewalls(vm);

    expect(detection.managers).toEqual([]);
    expect(detection.primary).toBeNull();
    expect(detection.failure?.status).toBe("agent_unreachable");
  });
});

describe("readGuestFirewallRules", () => {
  test("it parses ufw output", async () => {
    const vm = createVm({
      stdout: [
        "Status: active",
        "Default: deny (incoming), allow (outgoing), disabled (routed)",
        "",
        "To                         Action      From",
        "--                         ------      ----",
        "22/tcp                     ALLOW IN    Anywhere",
      ].join("\n"),
    });

    const result = await readGuestFirewallRules(vm, "ufw");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.state.active).toBe(true);
      expect(result.state.rules).toHaveLength(1);
      expect(result.state.rules[0]).toMatchObject({ dport: "22" });
    }
  });

  test("it reports a manager it cannot read yet without pretending to fail", async () => {
    const vm = createVm();

    const result = await readGuestFirewallRules(vm, "firewalld");

    expect(result).toEqual({
      status: "unsupported_manager",
      manager: "firewalld",
    });
  });

  test("it nests the reason when the command could not run", async () => {
    const vm = createVm({
      execError: new Error(
        "POST https://n/x connection failed with 403 Forbidden return: {}",
      ),
    });

    const result = await readGuestFirewallRules(vm, "ufw");

    expect(result).toEqual({
      status: "failed",
      failure: { status: "permission_denied", message: expect.any(String) },
    });
  });
});

describe("readListeningSockets", () => {
  test("it parses ss output", async () => {
    const vm = createVm({
      stdout:
        'tcp   LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=701,fd=3))\n',
    });

    const result = await readListeningSockets(vm);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.sockets).toHaveLength(1);
      expect(result.sockets[0]).toMatchObject({ port: 22, scope: "wildcard" });
    }
  });

  test("it nests the reason on failure", async () => {
    const vm = createVm({
      execError: new Error(
        'GET https://n/x return Error 500 Internal Server Error: {"errors":"guest agent is not running"}',
      ),
    });

    const result = await readListeningSockets(vm);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.failure.status).toBe("agent_unreachable");
    }
  });
});
