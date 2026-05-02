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

import type { ProxmoxInstance } from "./get-proxmox-instance";

type PerformPowerActionParams = {
  vm: ReturnType<ProxmoxInstance["node"]["qemu"]["$"]>;
  action:
    | "start"
    | "stop"
    | "pause"
    | "resume"
    | "suspend"
    | "reset"
    | "reboot"
    | "shutdown";
};

export const performPowerAction = async ({
  vm,
  action,
}: PerformPowerActionParams): Promise<string> => {
  let upid: string;
  switch (action) {
    case "start":
      upid = await vm.status.start.$post({
        timeout: 30,
      });
      break;
    case "stop":
      upid = await vm.status.stop.$post({
        timeout: 30,
      });
      break;
    case "pause":
      upid = await vm.status.suspend.$post({
        todisk: false,
      });
      break;
    case "resume":
      upid = await vm.status.resume.$post();
      break;
    case "suspend":
      upid = await vm.status.suspend.$post({
        todisk: true,
      });
      break;
    case "reset":
      upid = await vm.status.reset.$post();
      break;
    case "reboot":
      upid = await vm.status.reboot.$post({
        timeout: 30,
      });
      break;
    case "shutdown":
      upid = await vm.status.shutdown.$post({
        timeout: 30,
      });
      break;
    default:
      throw new Error(
        `Invalid power action: "${action}". Expected one of: start, stop, pause, resume, suspend, reset, reboot, shutdown.`,
      );
  }

  return upid;
};
