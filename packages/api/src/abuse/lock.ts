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

/** A level that is actually applied to a guest. */
export type ServerLockLevel = Exclude<EnforcementLevel, "none" | "terminate">;

/**
 * What one level of the lock replaced, so a release restores rather than
 * guesses.
 *
 * Every field is optional because each level touches a different part of the
 * configuration: `throttle` the network device, `isolate` the firewall,
 * `power_off` the boot flag and the run state.
 */
export interface ServerLockCapture {
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

/** One capture per level, which is the shape a release iterates. */
export type ServerLockStateByLevel = {
  [Level in ServerLockLevel]?: ServerLockCapture;
};

/**
 * What is on `abuse_case_servers.previous_state`.
 *
 * Keyed by level, because enforcement is a ladder: a case that escalates from
 * `throttle` to `isolate` has replaced two different things and a release has
 * to put back both. Keying it is what stops the second level from being
 * captured as "already recorded" and the first from never being undone.
 *
 * Rows written before that hold a bare {@link ServerLockCapture} at the top
 * level, so both shapes are readable here and {@link normalizeLockState} is
 * what every reader goes through.
 */
export type ServerLockPreviousState = ServerLockStateByLevel &
  ServerLockCapture;

/** Levels in the order they are applied, which is also severity order. */
const LOCK_LEVELS: readonly ServerLockLevel[] = [
  "throttle",
  "isolate",
  "power_off",
];

/**
 * Which level a legacy capture must have come from.
 *
 * A flat blob carries exactly one of these, because the old code captured on
 * the first application and never again, and only one branch writes each key.
 */
const LEGACY_OWNER: Record<keyof ServerLockCapture, ServerLockLevel> = {
  network: "throttle",
  firewall: "isolate",
  power: "power_off",
};

/**
 * Reads a stored `previous_state` as one capture per level.
 *
 * A row written before the column was keyed holds a bare capture, and the
 * level that took it is decided by which key it carries rather than by the
 * row's current `lock_level` - the two disagree on exactly the rows the
 * escalation bug damaged, where a `throttle` capture sits on an `isolate`
 * row, and the key is the half that is right.
 */
export const normalizeLockState = (
  state: ServerLockPreviousState | null | undefined,
): ServerLockStateByLevel => {
  if (!state) return {};

  const keyed: ServerLockStateByLevel = {};

  for (const level of LOCK_LEVELS) {
    const captured = state[level];
    if (captured) keyed[level] = captured;
  }

  for (const key of Object.keys(LEGACY_OWNER) as (keyof ServerLockCapture)[]) {
    const captured = state[key];
    if (!captured) continue;

    const owner = LEGACY_OWNER[key];
    // A keyed entry is never overwritten by a legacy one: if both are present
    // the keyed capture is the newer and more specific reading.
    if (keyed[owner]) continue;

    keyed[owner] = { [key]: captured } as ServerLockCapture;
  }

  return keyed;
};

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
 * Idempotent per level: applying a level that is already in force re-asserts
 * it and returns the state captured the first time, because reading "the
 * previous value" off an already-locked guest would record the lock as the
 * thing to restore.
 *
 * Escalation is not a re-assert. A case moving from `throttle` to `isolate`
 * has a `previous` already, and the firewall it is about to overwrite has
 * still never been recorded - so the decision is made per level rather than on
 * whether anything at all was captured before.
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
  level: ServerLockLevel;
  /** Whatever is on the row, in either shape. */
  previous?: ServerLockPreviousState | null;
}): Promise<ServerLockStateByLevel> => {
  const state = normalizeLockState(previous);
  /** Set when this level has been applied before, which makes this a re-assert. */
  const recorded = state[level];

  switch (level) {
    case "throttle": {
      const config = (await vm.config.$get()) as VmConfig;
      const net = findNetDevice(config);

      if (!net) return state;
      if (hasRateLimit(net.value) && recorded) return state;

      const captured: ServerLockStateByLevel = recorded
        ? state
        : { ...state, throttle: { network: net } };

      await vm.config.$put({
        [net.device]: withRateLimit(net.value, THROTTLE_RATE_MBPS),
      } as never);

      return captured;
    }

    case "isolate": {
      const options = await vm.firewall.options.$get();

      const captured: ServerLockStateByLevel = recorded
        ? state
        : {
            ...state,
            isolate: {
              firewall: {
                enable:
                  null === (options.enable ?? null)
                    ? null
                    : Boolean(options.enable),
                policyOut: options.policy_out ?? null,
              },
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

      const captured: ServerLockStateByLevel = recorded
        ? state
        : {
            ...state,
            power_off: {
              power: {
                onboot:
                  undefined === config.onboot ? null : Boolean(config.onboot),
                wasRunning: running,
              },
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

/** Undone in the reverse of the order the levels are applied in. */
const RELEASE_ORDER: readonly ServerLockLevel[] = [...LOCK_LEVELS].reverse();

/**
 * Puts back everything {@link applyServerLock} replaced.
 *
 * Every level that was ever applied is undone, not just the one the row is
 * sitting at: a case that escalated `throttle` to `isolate` left a rate limit
 * on the network device that outlives the firewall policy, and a release that
 * only looked at `isolate` would leave the customer capped at 1 MB/s for good.
 */
export const releaseServerLock = async ({
  vm,
  level,
  previous,
}: {
  vm: ProxmoxVm;
  /** The level the row is at. Undone even when nothing was captured for it. */
  level: ServerLockLevel;
  previous: ServerLockPreviousState | null;
}): Promise<void> => {
  const state = normalizeLockState(previous);
  let start = false;

  for (const applied of RELEASE_ORDER) {
    const captured = state[applied];
    // The row's own level always comes off, captured or not. A lock with no
    // recorded prior state still has to be lifted, and the fallbacks below are
    // what that meant before `previous_state` was keyed.
    if (!captured && applied !== level) continue;

    switch (applied) {
      case "throttle": {
        const net = captured?.network;
        // Nothing recorded is nothing to put back: the rate limit lives inside
        // the device string that would be restored.
        if (net) await vm.config.$put({ [net.device]: net.value } as never);
        break;
      }

      case "isolate": {
        const firewall = captured?.firewall;

        await vm.firewall.options.$put({
          // A guest whose firewall was off before the lock gets it switched
          // back off; one that had a policy of its own gets that policy, not
          // ACCEPT.
          enable: firewall?.enable ?? false,
          policy_out: (firewall?.policyOut ?? "ACCEPT") as FirewallPolicy,
        });
        break;
      }

      case "power_off": {
        const power = captured?.power;

        await vm.config.$put({ onboot: Boolean(power?.onboot) });
        if (power?.wasRunning) start = true;
        break;
      }
    }
  }

  // Last of all, so a guest does not come back up while a lower level of the
  // ladder is still on it.
  if (start) await vm.status.start.$post({ timeout: 30 });
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
