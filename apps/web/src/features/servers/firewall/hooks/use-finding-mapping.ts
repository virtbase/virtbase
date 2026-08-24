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
  LucideInfo,
  LucideShieldAlert,
  LucideTriangleAlert,
} from "@virtbase/ui/icons/index";
import { useExtracted } from "next-intl";
import type { FirewallFinding } from "./use-firewall-analysis";

export interface FindingDescriptor {
  title: string;
  description: string;
  icon: LucideIcon;
}

const SEVERITY_ICONS: Record<FirewallFinding["severity"], LucideIcon> = {
  critical: LucideShieldAlert,
  warning: LucideTriangleAlert,
  info: LucideInfo,
};

/**
 * Turns a finding into words.
 *
 * The API returns stable codes rather than sentences, so the wording can change
 * without a schema change and every locale renders the same situation the same
 * way. Each message names the port and, where the server told us, the process
 * holding it - "Redis is reachable" is actionable in a way that "port 6379 is
 * open" is not.
 */
export function useFindingMapping() {
  const t = useExtracted();

  return (finding: FirewallFinding): FindingDescriptor => {
    const port = String(finding.port ?? "");
    const proto = finding.proto ?? "";
    const service = finding.service ?? t("This service");
    const process = finding.processes[0] ?? "";
    // The manager id is already the name the customer sees in their own
    // terminal, so it is used verbatim rather than mapped through a table.
    const manager = finding.manager ?? t("the firewall inside your server");

    switch (finding.code) {
      case "EXPOSED_SENSITIVE_PORT":
        return {
          title: t("{service} can be reached from the internet", { service }),
          description: process
            ? t(
                "{process} is listening on port {port}/{proto} and both firewalls allow it. Restrict this port unless you meant to publish it.",
                { process, port, proto },
              )
            : t(
                "Port {port}/{proto} is open to everyone and both firewalls allow it. Restrict this port unless you meant to publish it.",
                { port, proto },
              ),
          icon: SEVERITY_ICONS[finding.severity],
        };
      case "BLOCKED_BY_GUEST_FIREWALL":
        return {
          title: t("Port {port} is blocked inside your server", { port }),
          description: t(
            "Your Virtbase rule allows port {port}, but {manager} blocks it, so traffic never reaches your service. Change this inside your server.",
            { port, manager },
          ),
          icon: SEVERITY_ICONS[finding.severity],
        };
      case "ORPHAN_RULE":
        return {
          title: t("Nothing is listening on port {port}", { port }),
          description: t(
            "A rule opens port {port}/{proto}, but no service is using it. Removing the rule keeps your firewall easier to read.",
            { port, proto },
          ),
          icon: SEVERITY_ICONS[finding.severity],
        };
      default:
        return {
          title: t("Some checks could not run"),
          description: t(
            "Virtbase could not look inside your server, so this list may be incomplete.",
          ),
          icon: LucideCircleAlert,
        };
    }
  };
}
