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
import { getGuestOsInfo, isPosixGuest } from "../os-info";
import { probeGuestAgent } from "../probe";
import type { ProxmoxVm } from "../types";

const createVm = ({
  info,
  osinfo,
  infoError,
  osinfoError,
}: {
  info?: unknown;
  osinfo?: unknown;
  infoError?: unknown;
  osinfoError?: unknown;
}) =>
  ({
    agent: {
      info: {
        $get: async () => {
          if (infoError) throw infoError;
          return info;
        },
      },
      "get-osinfo": {
        $get: async () => {
          if (osinfoError) throw osinfoError;
          return osinfo;
        },
      },
    },
  }) as unknown as ProxmoxVm;

const command = (name: string, enabled: boolean) => ({
  name,
  enabled,
  "success-response": true,
});

describe("probeGuestAgent", () => {
  test("it reports a healthy agent with guest-exec enabled", async () => {
    const vm = createVm({
      info: {
        result: {
          version: "8.2.1",
          supported_commands: [
            command("guest-ping", true),
            command("guest-exec", true),
          ],
        },
      },
    });

    expect(await probeGuestAgent(vm)).toEqual({
      reachable: true,
      execAvailable: true,
      version: "8.2.1",
      failure: null,
    });
  });

  test("it accepts a reply that is not wrapped in `result`", async () => {
    const vm = createVm({
      info: {
        version: "7.0.0",
        supported_commands: [command("guest-exec", true)],
      },
    });

    expect(await probeGuestAgent(vm)).toMatchObject({
      reachable: true,
      execAvailable: true,
      version: "7.0.0",
    });
  });

  test("it detects a guest-exec blocked via BLOCK_RPCS", async () => {
    const vm = createVm({
      info: {
        result: {
          version: "8.2.1",
          supported_commands: [
            command("guest-ping", true),
            command("guest-exec", false),
          ],
        },
      },
    });

    expect(await probeGuestAgent(vm)).toMatchObject({
      reachable: true,
      execAvailable: false,
    });
  });

  test("it treats an agent too old to list guest-exec as unable to exec", async () => {
    const vm = createVm({
      info: { result: { supported_commands: [command("guest-ping", true)] } },
    });

    expect(await probeGuestAgent(vm)).toMatchObject({
      reachable: true,
      execAvailable: false,
    });
  });

  test("it reports unknown rather than false when no command list comes back", async () => {
    // Answering means the agent is alive; we simply cannot tell what it allows,
    // and guessing `false` would hide a working feature.
    const vm = createVm({ info: { result: { version: "5.0.0" } } });

    expect(await probeGuestAgent(vm)).toMatchObject({
      reachable: true,
      execAvailable: null,
      version: "5.0.0",
    });
  });

  test("it reports an uninstalled or stopped agent as unreachable", async () => {
    const vm = createVm({
      infoError: new Error(
        'GET https://n/api2/json/x return Error 500 Internal Server Error: {"errors":"No QEMU guest agent configured"}',
      ),
    });

    expect(await probeGuestAgent(vm)).toMatchObject({
      reachable: false,
      execAvailable: null,
      failure: { status: "agent_unreachable" },
    });
  });

  test("it surfaces a permission problem instead of blaming the agent", async () => {
    const vm = createVm({
      infoError: new Error(
        "GET https://n/api2/json/x connection failed with 403 Forbidden return: {}",
      ),
    });

    expect(await probeGuestAgent(vm)).toMatchObject({
      reachable: false,
      failure: { status: "permission_denied" },
    });
  });
});

describe("getGuestOsInfo", () => {
  test("it maps a Debian guest", async () => {
    const vm = createVm({
      osinfo: {
        result: {
          id: "debian",
          name: "Debian GNU/Linux",
          "pretty-name": "Debian GNU/Linux 12 (bookworm)",
          version: "12 (bookworm)",
          "version-id": "12",
          "kernel-release": "6.1.0-18-amd64",
          machine: "x86_64",
        },
      },
    });

    expect(await getGuestOsInfo(vm)).toEqual({
      id: "debian",
      prettyName: "Debian GNU/Linux 12 (bookworm)",
      name: "Debian GNU/Linux",
      version: "12 (bookworm)",
      kernelRelease: "6.1.0-18-amd64",
    });
  });

  test("it returns null when the agent cannot answer", async () => {
    const vm = createVm({ osinfoError: new Error("boom") });

    expect(await getGuestOsInfo(vm)).toBeNull();
  });

  test("it returns null fields rather than undefined for a sparse reply", async () => {
    const vm = createVm({ osinfo: { result: { id: "alpine" } } });

    expect(await getGuestOsInfo(vm)).toEqual({
      id: "alpine",
      prettyName: null,
      name: null,
      version: null,
      kernelRelease: null,
    });
  });
});

describe("isPosixGuest", () => {
  test("it excludes Windows", () => {
    expect(
      isPosixGuest({
        id: "mswindows",
        prettyName: "Windows Server 2022",
        name: null,
        version: null,
        kernelRelease: null,
      }),
    ).toBe(false);
  });

  test("it includes Linux and an unknown OS", () => {
    expect(
      isPosixGuest({
        id: "ubuntu",
        prettyName: null,
        name: null,
        version: null,
        kernelRelease: null,
      }),
    ).toBe(true);
    expect(isPosixGuest(null)).toBe(true);
  });
});
