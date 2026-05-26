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

import { FatalError, getStepMetadata, RetryableError } from "workflow";
import type { GetProxmoxInstanceParams } from "../../proxmox";
import {
  findFollowUpGuestPowerTask,
  getProxmoxInstance,
  isHaPowerTask,
} from "../../proxmox";

interface WaitForProxmoxTaskStepParams {
  proxmoxNode: GetProxmoxInstanceParams;
  upid: string;
  ignoreErrors?: boolean;
  ignoreFollowupTask?: boolean;
}

/**
 * Workflow step that waits for a given Proxmox VE task to finish.
 * By default, the function will throw an error if the task fails.
 *
 * It will retry the task up to 10 times, with exponential backoff.
 *
 * 1: 1 second 2: 4 seconds 3: 9 seconds 4: 16 seconds, max 60 seconds
 *
 * @returns `true` if the task finished successfully, `false` if the task failed and `ignoreErrors` is `true`
 */
export async function waitForProxmoxTaskStep({
  proxmoxNode,
  upid,
  ignoreErrors = false,
  ignoreFollowupTask = false,
}: WaitForProxmoxTaskStepParams) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const { node } = instance;

  // Retrieve the latest task status
  const task = await node.tasks.$(upid).status.$get();

  if (task.status === "stopped") {
    if (task.exitstatus === "OK") {
      // Task finished successfully

      // If the task is a high availability start or stop, the actual
      // qm{start,stop,shutdown,...} task is created separately by the CRM/LRM
      // 1-2 seconds (and up to ~20s in worst case) later. Proxmox does not
      // link the two via UPID, so we poll the task list by vmid until the
      // follow-up appears and then wait on that instead.
      if (isHaPowerTask(task) && !ignoreFollowupTask) {
        const vmid = Number(task.id);
        if (!Number.isFinite(vmid)) {
          throw new FatalError(
            `Could not parse vmid from HA task "${upid}" (id="${task.id}").`,
          );
        }

        const followUpTask = await findFollowUpGuestPowerTask(instance, vmid, {
          sinceStarttime: task.starttime,
        });

        if (followUpTask) {
          return waitForProxmoxTaskStep({
            proxmoxNode,
            upid: followUpTask.upid,
            ignoreErrors,
          });
        }

        // HA task finished but the guest power task hasn't been created yet.
        // Keep retrying with a tighter backoff so we pick it up quickly.
        throw new RetryableError(
          `Proxmox HA task "${upid}" finished but follow-up guest power task has not been created yet.`,
          { retryAfter: 2_000 },
        );
      }

      return true;
    }

    // Thet task is stopped, but not successfully
    if (ignoreErrors) {
      return false;
    }

    throw new FatalError(
      `Proxmox task "${upid}" failed with exit status ${task.exitstatus}.`,
    );
  }

  if (task.status === "running") {
    const metadata = getStepMetadata();

    throw new RetryableError(`Proxmox task "${upid}" is still running.`, {
      // 1: 1 second 2: 4 seconds 3: 9 seconds 4: 16 seconds, max 60 seconds
      retryAfter: Math.min(metadata.attempt ** 2, 60) * 1000,
    });
  }

  throw new FatalError(
    `Received an unexpected Proxmox task status: "${task.status}" for task "${upid}".`,
  );
}

waitForProxmoxTaskStep.maxRetries = 10;
