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
import type { GuestOsInfo } from "../os-info";
import type { GuestAgentProbe } from "../probe";
import { resolveAgentStatus } from "../resolve-status";

const healthy: GuestAgentProbe = {
  reachable: true,
  execAvailable: true,
  version: "8.2.1",
  failure: null,
};

const debian: GuestOsInfo = {
  id: "debian",
  prettyName: "Debian GNU/Linux 12 (bookworm)",
  name: null,
  version: "12 (bookworm)",
  kernelRelease: "6.1.0-18-amd64",
};

describe("resolveAgentStatus", () => {
  test("it reports ok for a running server with a working agent", () => {
    expect(
      resolveAgentStatus({
        configured: true,
        running: true,
        probe: healthy,
        os: debian,
      }),
    ).toBe("ok");
  });

  test("it reports a stopped server rather than nagging about the agent", () => {
    expect(
      resolveAgentStatus({
        configured: true,
        running: false,
        probe: null,
        os: null,
      }),
    ).toBe("server_stopped");
  });

  test("it reports a disabled agent even while the server is stopped", () => {
    // The configuration is readable either way, so this stays accurate.
    expect(
      resolveAgentStatus({
        configured: false,
        running: false,
        probe: null,
        os: null,
      }),
    ).toBe("not_configured");
  });

  test("it reports an uninstalled agent as unreachable", () => {
    expect(
      resolveAgentStatus({
        configured: true,
        running: true,
        probe: {
          reachable: false,
          execAvailable: null,
          version: null,
          failure: { status: "agent_unreachable" },
        },
        os: null,
      }),
    ).toBe("unreachable");
  });

  test("it does not blame the customer for our missing permission", () => {
    // A token without VM.GuestAgent.Unrestricted must never render as
    // "reinstall the guest agent" - the agent may be perfectly fine.
    expect(
      resolveAgentStatus({
        configured: true,
        running: true,
        probe: {
          reachable: false,
          execAvailable: null,
          version: null,
          failure: { status: "permission_denied" },
        },
        os: null,
      }),
    ).toBe("unavailable");
  });

  test("it reports a blocked guest-exec separately from a missing agent", () => {
    expect(
      resolveAgentStatus({
        configured: true,
        running: true,
        probe: { ...healthy, execAvailable: false },
        os: debian,
      }),
    ).toBe("exec_unavailable");
  });

  test("it treats an agent that lists no commands as usable", () => {
    expect(
      resolveAgentStatus({
        configured: true,
        running: true,
        probe: { ...healthy, execAvailable: null },
        os: debian,
      }),
    ).toBe("ok");
  });

  test("it reports a Windows guest as unsupported", () => {
    expect(
      resolveAgentStatus({
        configured: true,
        running: true,
        probe: healthy,
        os: {
          id: "mswindows",
          prettyName: "Windows Server 2022",
          name: null,
          version: null,
          kernelRelease: null,
        },
      }),
    ).toBe("unsupported_os");
  });

  test("it treats an unknown OS as supported", () => {
    expect(
      resolveAgentStatus({
        configured: true,
        running: true,
        probe: healthy,
        os: null,
      }),
    ).toBe("ok");
  });

  test("it prefers unsupported_os over exec_unavailable", () => {
    // Windows is the more useful thing to say: enabling guest-exec there still
    // would not make the POSIX probes work.
    expect(
      resolveAgentStatus({
        configured: true,
        running: true,
        probe: { ...healthy, execAvailable: false },
        os: {
          id: "mswindows",
          prettyName: "Windows Server 2022",
          name: null,
          version: null,
          kernelRelease: null,
        },
      }),
    ).toBe("unsupported_os");
  });
});
