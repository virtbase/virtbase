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

import type { GuestFirewallManager } from "@virtbase/utils";

/**
 * [!] Everything in this file is a constant, and must stay one.
 *
 * These strings are executed as root inside a customer's server. Interpolating
 * anything that came from a request into them is remote code execution, so a
 * value that genuinely has to vary belongs in its own argv element after being
 * validated - never concatenated into a script.
 *
 * The scripts are POSIX `sh`, not bash: Alpine and other minimal images have no
 * bash, and a bashism here fails on exactly the servers least likely to have a
 * guest agent to debug it with. They also avoid `${...}` parameter expansion,
 * which cannot appear inside a TypeScript template literal without escaping.
 */

/**
 * Reports which host firewalls exist and which are actually filtering.
 *
 * "Filtering" is asked of each manager in its own terms rather than through
 * systemd, because the service being up says little: `nftables.service` is
 * enabled on hosts with no rules, while `iptables` has no service at all and
 * filters whenever a ruleset is loaded.
 *
 * `iptables` is deliberately narrowed to the INPUT chain. Docker and libvirt
 * add FORWARD rules on hosts whose owner never configured a firewall, and
 * warning those customers about a firewall they did not set up is worse than
 * saying nothing.
 */
export const DETECT_SCRIPT = [
  "if command -v ufw >/dev/null 2>&1; then",
  "  echo 'ufw present'",
  "  ufw status 2>/dev/null | head -n 1 | grep -qi 'Status: active' && echo 'ufw active'",
  "fi",
  "if command -v firewall-cmd >/dev/null 2>&1; then",
  "  echo 'firewalld present'",
  "  [ \"$(firewall-cmd --state 2>/dev/null)\" = 'running' ] && echo 'firewalld active'",
  "fi",
  "if command -v nft >/dev/null 2>&1; then",
  "  echo 'nftables present'",
  "  nft list ruleset 2>/dev/null | grep -q 'hook input' && echo 'nftables active'",
  "fi",
  "if command -v iptables-save >/dev/null 2>&1; then",
  "  echo 'iptables present'",
  "  iptables-save -t filter 2>/dev/null | grep -qE '^-A INPUT|^:INPUT (DROP|REJECT)' && echo 'iptables active'",
  "fi",
  // The last `grep` decides the exit status otherwise, making a server with no
  // firewall look like a failed command.
  "exit 0",
].join("\n");

/**
 * Lists listening sockets.
 *
 * `-n` is not optional: without it the port column carries service names, which
 * cannot be turned back into port numbers. `netstat` is the busybox fallback -
 * Alpine ships no `ss`.
 */
export const LISTENING_SOCKETS_SCRIPT = [
  "if command -v ss >/dev/null 2>&1; then",
  "  ss -H -ltnup 2>/dev/null",
  "else",
  "  netstat -tulpn 2>/dev/null",
  "fi",
  "exit 0",
].join("\n");

/**
 * The dump command for each manager.
 *
 * ufw and firewalld are asked in their own vocabulary rather than through the
 * nftables ruleset they compile down to: a customer who wrote `ufw allow 22`
 * should be shown that rule, not the six nft statements it became.
 */
export const RULE_DUMP_SCRIPTS: Record<GuestFirewallManager, string> = {
  ufw: "ufw status verbose 2>/dev/null; exit 0",
  firewalld: "firewall-cmd --list-all 2>/dev/null; exit 0",
  nftables: "nft -j list ruleset 2>/dev/null; exit 0",
  iptables: "iptables-save -t filter 2>/dev/null; exit 0",
};

/** Wraps a script so the guest agent runs it through a shell. */
export const shell = (script: string): readonly string[] => [
  "/bin/sh",
  "-c",
  script,
];
