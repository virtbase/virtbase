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

import type { ListeningSocket } from "@virtbase/utils";

export interface ContextRule {
  pos: number;
  enabled: boolean;
  direction?: string;
  action: string;
  proto?: string;
  dport?: string;
  sport?: string;
  source?: string;
  comment?: string;
}

export interface BuildContextInput {
  /** The guest operating system, when known. */
  os: string | null;
  policyIn: string | null;
  policyOut: string | null;
  rules: ContextRule[];
  /** `null` when the server could not be inspected. */
  sockets: ListeningSocket[] | null;
  /** The firewall running inside the server, when one is active. */
  guestManager: string | null;
}

const describeRule = (rule: ContextRule): string => {
  const parts = [
    `${rule.pos + 1}.`,
    rule.enabled ? "" : "(disabled)",
    rule.direction ?? "in/out",
    rule.action,
    rule.proto ?? "any-proto",
  ];

  if (rule.dport) {
    parts.push(`dport ${rule.dport}`);
  }

  if (rule.sport) {
    parts.push(`sport ${rule.sport}`);
  }

  if (rule.source) {
    parts.push(`from ${rule.source}`);
  }

  if (rule.comment) {
    parts.push(`- ${rule.comment}`);
  }

  return parts.filter(Boolean).join(" ");
};

const describeSocket = (socket: ListeningSocket): string => {
  const process = socket.processes[0]?.name;

  return `${socket.port}/${socket.protocol}${process ? ` (${process})` : ""}`;
};

/** Collapses the same service bound to several addresses into one entry. */
const unique = (sockets: ListeningSocket[]): string[] => {
  const seen = new Map<string, string>();

  for (const socket of sockets) {
    const key = `${socket.protocol}:${socket.port}`;

    if (!seen.has(key)) {
      seen.set(key, describeSocket(socket));
    }
  }

  return [...seen.values()];
};

/**
 * Describes the server the rules are being written for.
 *
 * This is the single biggest thing missing from generation before: the model
 * used to see only the customer's sentence, so it could not know that SSH had
 * been moved to 2222, that a rule for the port already existed, or that the
 * default policy already blocked what it was being asked to block. It answered
 * anyway, which is exactly how you get plausible and wrong.
 *
 * Sections that are not known are left out rather than filled with a guess -
 * and their absence is stated, so the model tells the customer it could not
 * check instead of asserting something it cannot see.
 */
export const buildGenerationContext = ({
  os,
  policyIn,
  policyOut,
  rules,
  sockets,
  guestManager,
}: BuildContextInput): string => {
  const lines: string[] = [];

  if (os) {
    lines.push(`Operating system: ${os}`);
  }

  lines.push(
    `Default policy: incoming ${policyIn ?? "unknown"}, outgoing ${policyOut ?? "unknown"}`,
  );

  if (rules.length === 0) {
    lines.push("Existing rules: none");
  } else {
    lines.push(
      "Existing rules, evaluated top to bottom, first match wins:",
      ...rules.map((rule) => `  ${describeRule(rule)}`),
    );
  }

  if (sockets === null) {
    lines.push("Listening ports: unknown, the server could not be inspected");
  } else {
    // The bind address is the whole point: a port on loopback is unreachable
    // from outside no matter what rule is written for it.
    const exposed = unique(
      sockets.filter((socket) => socket.scope !== "loopback"),
    );
    const local = unique(
      sockets.filter((socket) => socket.scope === "loopback"),
    );

    lines.push(
      exposed.length > 0
        ? `Listening on all interfaces: ${exposed.join(", ")}`
        : "Listening on all interfaces: none",
    );

    if (local.length > 0) {
      lines.push(
        `Listening on loopback only, unreachable from outside: ${local.join(", ")}`,
      );
    }
  }

  if (guestManager) {
    lines.push(
      `A second firewall runs inside the server (${guestManager}). Traffic must pass both.`,
    );
  }

  return lines.join("\n");
};
