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

import type { EnforcementLevel } from "@virtbase/ports";
import type { ProxmoxInstance } from "../proxmox";

/** The VM handle every function here operates on. */
export type ProxmoxVm = ReturnType<ProxmoxInstance["node"]["qemu"]["$"]>;

/**
 * Outbound rate a throttled guest is held to, in megabytes per second.
 *
 * Low enough that a flood stops mattering, high enough that the customer can
 * still log in, read their logs and download a patch - which is what they need
 * to do to get the lock released.
 */
export const THROTTLE_RATE_MBPS = 1;

/**
 * What the guest looked like before the lock, so a release restores rather
 * than guesses.
 *
 * Stored on `abuse_case_servers.previous_state`. Every field is optional
 * because each level touches a different part of the configuration.
 */
export interface ServerLockPreviousState {
  firewall?: {
    enable: boolean | null;
    /** `ACCEPT` | `DROP` | `REJECT`, as Proxmox spells it. */
    policyOut: string | null;
  };
  network?: {
    /** `net0`, `net1`. */
    device: string;
    value: string;
  };
  power?: {
    onboot: boolean | null;
    wasRunning: boolean;
  };
}

interface VmConfig {
  onboot?: boolean | number;
  [key: string]: unknown;
}

/** The policy union the client accepts, taken from the client rather than retyped. */
type FirewallPolicy = NonNullable<
  NonNullable<
    Parameters<ProxmoxVm["firewall"]["options"]["$put"]>[0]
  >["policy_out"]
>;

/** The first network device on the guest, which is the one carrying its traffic. */
const findNetDevice = (
  config: VmConfig,
): { device: string; value: string } | null => {
  for (const key of Object.keys(config).sort()) {
    if (/^net\d+$/.test(key) && "string" === typeof config[key]) {
      return { device: key, value: config[key] as string };
    }
  }
  return null;
};

/** Proxmox writes the cap as a `rate=` key inside the net device string. */
const hasRateLimit = (value: string): boolean =>
  value.split(",").some((part) => part.startsWith("rate="));

const withRateLimit = (value: string, mbps: number): string =>
  `${value
    .split(",")
    .filter((part) => !part.startsWith("rate="))
    .join(",")},rate=${mbps}`;

/**
 * Applies a lock to one guest and reports what it replaced.
 *
 * Idempotent: applying a lock that is already in force re-asserts it and
 * returns the state captured the first time, because reading "the previous
 * value" off an already-locked guest would record the lock as the thing to
 * restore.
 *
 * `terminate` is absent on purpose. It is not a hypervisor lock - it sets
 * `terminates_at` and hands the server to the existing deletion lifecycle,
 * which is the caller's job rather than this module's.
 */
export const applyServerLock = async ({
  vm,
  level,
  previous,
}: {
  vm: ProxmoxVm;
  level: Exclude<EnforcementLevel, "none" | "terminate">;
  /** Set on a re-assert, so the original state is not overwritten by the lock. */
  previous?: ServerLockPreviousState | null;
}): Promise<ServerLockPreviousState> => {
  switch (level) {
    case "throttle": {
      const config = (await vm.config.$get()) as VmConfig;
      const net = findNetDevice(config);

      if (!net) return previous ?? {};
      if (hasRateLimit(net.value) && previous) return previous;

      const captured: ServerLockPreviousState = previous ?? { network: net };

      await vm.config.$put({
        [net.device]: withRateLimit(net.value, THROTTLE_RATE_MBPS),
      } as never);

      return captured;
    }

    case "isolate": {
      const options = await vm.firewall.options.$get();

      const captured: ServerLockPreviousState = previous ?? {
        firewall: {
          enable:
            null === (options.enable ?? null) ? null : Boolean(options.enable),
          policyOut: options.policy_out ?? null,
        },
      };

      // Outbound only. The abuse leaves the guest, and dropping inbound as
      // well would lock the customer out of the machine they have to fix.
      await vm.firewall.options.$put({ enable: true, policy_out: "DROP" });

      return captured;
    }

    case "power_off": {
      const [config, status] = await Promise.all([
        vm.config.$get() as Promise<VmConfig>,
        vm.status.current.$get(),
      ]);

      const running = "running" === status.status;

      const captured: ServerLockPreviousState = previous ?? {
        power: {
          onboot: undefined === config.onboot ? null : Boolean(config.onboot),
          wasRunning: running,
        },
      };

      // Before the stop, not after: a node rebooting between the two would
      // otherwise bring the guest back up.
      await vm.config.$put({ onboot: false });

      if (running) {
        await vm.status.stop.$post({ timeout: 30 });
      }

      return captured;
    }
  }
};

/** Puts back what {@link applyServerLock} replaced. */
export const releaseServerLock = async ({
  vm,
  level,
  previous,
}: {
  vm: ProxmoxVm;
  level: Exclude<EnforcementLevel, "none" | "terminate">;
  previous: ServerLockPreviousState | null;
}): Promise<void> => {
  switch (level) {
    case "throttle": {
      const net = previous?.network;
      if (!net) return;

      await vm.config.$put({ [net.device]: net.value } as never);
      return;
    }

    case "isolate": {
      const firewall = previous?.firewall;

      await vm.firewall.options.$put({
        // A guest whose firewall was off before the lock gets it switched back
        // off; one that had a policy of its own gets that policy, not ACCEPT.
        enable: firewall?.enable ?? false,
        policy_out: (firewall?.policyOut ?? "ACCEPT") as FirewallPolicy,
      });
      return;
    }

    case "power_off": {
      const power = previous?.power;

      await vm.config.$put({ onboot: Boolean(power?.onboot) });

      if (power?.wasRunning) {
        await vm.status.start.$post({ timeout: 30 });
      }
      return;
    }
  }
};

/**
 * Whether the lock is actually in force on the hypervisor right now.
 *
 * The customer's own API can edit firewall options and the network device, so
 * a lock applied once is not a lock. This is what reconciliation compares
 * against, and a `false` here is drift rather than an error.
 */
export const isServerLockInForce = async ({
  vm,
  level,
}: {
  vm: ProxmoxVm;
  level: Exclude<EnforcementLevel, "none" | "terminate">;
}): Promise<boolean> => {
  switch (level) {
    case "throttle": {
      const net = findNetDevice((await vm.config.$get()) as VmConfig);
      return Boolean(net && hasRateLimit(net.value));
    }

    case "isolate": {
      const options = await vm.firewall.options.$get();
      return Boolean(options.enable) && "DROP" === options.policy_out;
    }

    case "power_off": {
      const [config, status] = await Promise.all([
        vm.config.$get() as Promise<VmConfig>,
        vm.status.current.$get(),
      ]);

      return "running" !== status.status && !config.onboot;
    }
  }
};
