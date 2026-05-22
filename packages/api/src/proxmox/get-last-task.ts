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

import { PROXMOX_TASK_STATUS_MAPPING } from "@virtbase/utils";
import type { Proxmox } from "proxmox-api";
import { isHaPowerTask } from "./find-follow-up-guest-power-task";
import type { getProxmoxInstance } from "./get-proxmox-instance";

/**
 * How long after a `hastart`/`hastop` task finishes we still surface it as the
 * active task while waiting for the follow-up `qm*` task to appear. The
 * CRM/LRM polling loop can introduce up to ~20s of delay; the extra headroom
 * here covers a slightly longer worst case so the UI does not flicker to idle
 * during that window.
 */
const HA_FOLLOW_UP_GRACE_SECONDS = 30;

const isRecognizedPowerTask = (task: Proxmox.nodesTasksNodeTasks): boolean =>
  task.type in PROXMOX_TASK_STATUS_MAPPING;

export const getLastTask = async (
  instance: ReturnType<typeof getProxmoxInstance>,
  vmid: number,
): Promise<Proxmox.nodesTasksNodeTasks | null> => {
  try {
    const taskList = await instance.node.tasks.$get({
      vmid,
      // Fetch enough to catch both a freshly-finished HA task and any follow-up
      // `qm*` task that may have appeared in the same window. `source: "all"`
      // is required because the HA task drops out of the "active" view almost
      // immediately, which is exactly what caused the UI to flap.
      limit: 10,
      source: "all",
      errors: false,
    });

    // Most-recent first.
    const orderedTasks = taskList
      .filter(isRecognizedPowerTask)
      .sort((a, b) => b.starttime - a.starttime);

    // 1. Any running power task takes priority — it's the actual ongoing work.
    const runningTask = orderedTasks.find((task) => task.status === "RUNNING");
    if (runningTask) {
      return runningTask;
    }

    // 2. Bridge the HA -> `qm*` gap: if the most recent power task is a
    //    finished `hastart`/`hastop` and the follow-up guest task has not yet
    //    appeared, keep reporting the HA task so the UI stays in
    //    STARTING/STOPPING instead of briefly going idle. We only do this for
    //    the most-recent task — once any `qm*` task has shown up (running or
    //    finished), the operation has moved past the gap and we should report
    //    that instead (which means `null` if it has already finished).
    const mostRecent = orderedTasks.at(0);
    if (
      mostRecent &&
      isHaPowerTask(mostRecent) &&
      mostRecent.endtime !== undefined
    ) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds - mostRecent.endtime < HA_FOLLOW_UP_GRACE_SECONDS) {
        return mostRecent;
      }
    }

    return null;
  } catch {
    // ignored: no task status available
    return null;
  }
};
