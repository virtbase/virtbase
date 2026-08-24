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

"use client";

import type { LucideIcon } from "@virtbase/ui/icons";
import {
  LucideCircleAlert,
  LucideCircleCheck,
  LucideInfo,
  LucidePowerOff,
  LucideTriangleAlert,
} from "@virtbase/ui/icons";
import type { ServerAgentStatus } from "@virtbase/validators/server";
import { useExtracted } from "next-intl";

interface AgentStatusDescriptor {
  title: string;
  description: string;
  icon: LucideIcon;
  variant: "default" | "warning" | "destructive";
  /**
   * Whether this state is worth interrupting the customer over.
   *
   * A working agent needs no notice, and neither does a switched-off server -
   * the customer already knows, and a warning there is pure noise.
   */
  notify: boolean;
}

/**
 * Maps every guest agent state onto what the customer should read.
 *
 * The wording matters more than usual here: the agent is software running
 * inside their server, so most of these states are things only they can fix -
 * except `unavailable`, which is ours and must never read as their fault.
 */
export function useAgentStatusMapping(): Record<
  ServerAgentStatus,
  AgentStatusDescriptor
> {
  const t = useExtracted();

  const packageName = "qemu-guest-agent";

  return {
    ok: {
      title: t("Guest agent is running"),
      description: t("Virtbase can read details from inside this server."),
      icon: LucideCircleCheck,
      variant: "default",
      notify: false,
    },
    server_stopped: {
      title: t("Server is not running"),
      description: t("Start the server to check its guest agent."),
      icon: LucidePowerOff,
      variant: "default",
      notify: false,
    },
    unreachable: {
      title: t("Guest agent is not responding"),
      description: t(
        "Storage usage, password resets and firewall detection need the {packageName} package installed and running inside your server.",
        { packageName },
      ),
      icon: LucideTriangleAlert,
      variant: "warning",
      notify: true,
    },
    not_configured: {
      title: t("Guest agent is switched off"),
      description: t(
        "The guest agent is disabled in this server's configuration, so Virtbase cannot read anything from inside it.",
      ),
      icon: LucideTriangleAlert,
      variant: "warning",
      notify: true,
    },
    exec_unavailable: {
      title: t("Guest agent cannot run commands"),
      description: t(
        "The agent is running but command execution is blocked. Remove guest-exec from BLOCK_RPCS in /etc/default/{packageName} to enable firewall and port detection.",
        { packageName },
      ),
      icon: LucideCircleAlert,
      variant: "warning",
      notify: true,
    },
    unsupported_os: {
      title: t("Not available on this operating system"),
      description: t(
        "Reading the firewall and open ports from inside a server is currently supported on Linux only.",
      ),
      icon: LucideInfo,
      variant: "default",
      notify: true,
    },
    unavailable: {
      // Ours to fix, not theirs - never suggest they reinstall a working agent.
      title: t("Guest agent status is unavailable"),
      description: t(
        "Virtbase could not check the guest agent right now. Please try again later.",
      ),
      icon: LucideInfo,
      variant: "default",
      notify: true,
    },
  };
}
