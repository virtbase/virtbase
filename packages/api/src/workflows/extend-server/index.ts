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

import { sleep } from "workflow";
import {
  applyGuestConfigStep,
  rollbackApplyGuestConfigStep,
} from "../shared/apply-guest-config";
import {
  performGuestActionStep,
  rollbackPerformGuestActionStep,
} from "../shared/perform-guest-action";
import { reportSwallowedFailureStep } from "../shared/report-swallowed-failure";
import { runRollbacks } from "../shared/run-rollbacks";
import { waitForProxmoxTaskStep } from "../shared/wait-for-proxmox-task";
import { sendServerExtendedEmailStep } from "./send-server-extended-email";
import {
  rollbackStoreServerExtensionStep,
  storeServerExtensionStep,
} from "./store-server-extension";

type ExtendServerWorkflowParams = {
  serverId: string;
  /**
   * The order that paid for the extension, when it came from one.
   *
   * Passed through to the store step, which uses it to find and settle the
   * `subscription_renewals` row this extension answers. Optional: an extension
   * started by hand, by a script, or by anything other than order fulfilment
   * has no order behind it, and neither does any server whose customer has
   * never had a subscription.
   */
  orderId?: string | null;
};

export async function extendServerWorkflow({
  serverId,
  orderId,
}: ExtendServerWorkflowParams) {
  "use workflow";

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    const {
      server,
      proxmoxNode,
      newTerminatesAt,
      user,
      previousTerminatesAt,
      previousSubscriptionPeriod,
      settledRenewalId,
    } = await storeServerExtensionStep({ serverId, orderId });

    rollbacks.push(() =>
      rollbackStoreServerExtensionStep({
        serverId,
        suspendedAt: server.suspendedAt,
        // All three captured by the forward step, and all three have to go
        // back together. The term is restored rather than recomputed, because
        // a renewal-backed extension grants the renewal's own period rather
        // than a flat month; the subscription's period comes back with it, or
        // the two diverge in the direction that bills a customer for a term
        // they do not have; and the renewal is un-settled, or the period it
        // holds can never be claimed again and the subscription is never
        // charged again at all.
        previousTerminatesAt,
        previousSubscriptionPeriod,
        settledRenewalId,
      }),
    );

    const { previousConfig, addedKeys } = await applyGuestConfigStep({
      proxmoxNode,
      vmid: server.vmid,
      config: {
        // Re-enable the server to boot on host node boot.
        onboot: true,
      },
      mode: "sync",
    });

    rollbacks.push(async () => {
      const { upid } = await rollbackApplyGuestConfigStep({
        proxmoxNode,
        vmid: server.vmid,
        previousConfig,
        addedKeys,
        mode: "sync",
      });
      if (null !== upid) {
        await waitForProxmoxTaskStep({
          proxmoxNode,
          upid,
          ignoreErrors: true,
        });
      }
    });

    const { upid: startUpid } = await performGuestActionStep({
      action: "start",
      proxmoxNode,
      vmid: server.vmid,
    });

    if (null !== startUpid) {
      await sleep("5s");
      await waitForProxmoxTaskStep({
        proxmoxNode,
        upid: startUpid,
        ignoreErrors: false,
      });
    }

    rollbacks.push(async () => {
      const { upid: rollbackStartUpid } = await rollbackPerformGuestActionStep({
        proxmoxNode,
        vmid: server.vmid,
        initialAction: "start",
        upid: startUpid,
      });
      if (null !== rollbackStartUpid) {
        await waitForProxmoxTaskStep({
          proxmoxNode,
          upid: rollbackStartUpid,
          ignoreErrors: true,
        });
      }
    });

    // [!] Post-success side effect, and not compensable. The extension is paid
    // for and already written; `sendEmail` throws on a delivery failure, and
    // letting it escape would run `rollbackStoreServerExtensionStep` and revert
    // a term the customer bought. Report it and keep the extension.
    if (null !== newTerminatesAt) {
      try {
        await sendServerExtendedEmailStep({
          user,
          serverName: server.name,
          newTerminatesAt,
        });
      } catch (error) {
        await reportSwallowedFailureStep({
          workflow: "extendServerWorkflow",
          operation: "sendServerExtendedEmailStep",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    // Every compensation is attempted, even if an earlier one throws - see
    // `runRollbacks`. The original error is what the caller gets.
    await runRollbacks(rollbacks, "extendServerWorkflow");
    throw error;
  }
}
