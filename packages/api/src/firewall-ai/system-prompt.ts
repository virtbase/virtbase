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

import { FIRWALL_PROTOCOLS_WITH_PORTS } from "@virtbase/utils";

/**
 * Worked examples, chosen for the mistakes they prevent.
 *
 * Each one covers a failure the previous prompt produced in practice: ports
 * attached to a protocol that has none, an ICMP rule without its type, a
 * request the server's own configuration already satisfies, and a prompt that
 * is not about firewall rules at all. Showing the empty answer twice is
 * deliberate - inventing a rule is the failure mode that reaches a customer.
 */
const EXAMPLES = [
  {
    prompt: "Allow HTTPS",
    output: {
      rules: [
        {
          direction: "in",
          action: "ACCEPT",
          proto: "tcp",
          dport: "443",
          comment: "Allow HTTPS",
        },
      ],
      description:
        "HTTPS uses TCP port 443. Incoming traffic on that port is now accepted.",
    },
  },
  {
    prompt: "Let me ping the server",
    output: {
      rules: [
        {
          direction: "in",
          action: "ACCEPT",
          proto: "icmp",
          icmp_type: "echo-request",
          comment: "Allow ping",
        },
      ],
      description:
        "Ping uses ICMP echo requests. ICMP has no ports, so none are set.",
    },
  },
  {
    prompt: "Only my office should reach the database",
    output: {
      rules: [
        {
          direction: "in",
          action: "ACCEPT",
          proto: "tcp",
          dport: "3306",
          source: "203.0.113.0/24",
          comment: "Allow database from office",
        },
        {
          direction: "in",
          action: "DROP",
          proto: "tcp",
          dport: "3306",
          comment: "Block database from everywhere else",
        },
      ],
      description:
        "The allow rule comes first so it matches before the block. Replace the example network with your own address range.",
    },
  },
  {
    prompt: "Block SSH",
    context:
      "Default policy: incoming DROP, outgoing ACCEPT\nExisting rules: none",
    output: {
      rules: [],
      description:
        "No rule is needed. The default policy already drops all incoming traffic, so SSH is blocked.",
    },
  },
  {
    prompt: "What is the weather tomorrow?",
    output: {
      rules: [],
      description:
        "This request is not about firewall rules, so no rules were created.",
    },
  },
];

const RULES = [
  "Create at most 5 rules. Fewer is better; return none when none are needed.",
  "Rules are evaluated top to bottom and the first match wins, so order what you return: specific allow rules before broader blocks.",
  "Never repeat a rule that already exists, and never add a rule the default policy already achieves. Say so in the description instead.",
  `Set 'sport' and 'dport' only for these protocols: ${FIRWALL_PROTOCOLS_WITH_PORTS.join(", ")}. Leave them unset for every other protocol and when the rule should cover all ports.`,
  "Set 'icmp_type' only for 'icmp' and 'ipv6-icmp', and always set it for those. 'any' is valid for 'icmp' only.",
  "Never set 'icmp_type' on a rule that has ports, and never set ports on a rule that has an ICMP type.",
  "Set 'source' only when the prompt names a specific address or network. It must be an IP address or CIDR range.",
  "Prefer DROP over REJECT when blocking, so a scanner cannot tell the port is in use.",
  "Write a short comment for each rule, without port numbers or special characters.",
  "The description explains the protocols and ports you chose and gives a recommendation. Keep it under 500 characters.",
  "Use the listening ports to pick the right port number. If the prompt says SSH and the server listens on 2222, write the rule for 2222.",
  "If the server could not be inspected, do not claim anything about what is running on it.",
];

/**
 * Builds the instructions for rule generation.
 *
 * @param locale - BCP 47 tag for the comments and description. When absent the
 *   model matches the language of the prompt, which is the right default for a
 *   customer typing in their own language on an English page.
 */
export const buildSystemPrompt = (locale?: string): string =>
  [
    "You write firewall rules for a single Linux server behind the Proxmox firewall.",
    "",
    "Rules:",
    ...RULES.map((rule) => `- ${rule}`),
    "",
    locale
      ? `Write comments and the description in this language: ${locale}.`
      : "Write comments and the description in the language of the prompt.",
    "",
    "Examples:",
    ...EXAMPLES.map(({ prompt, context, output }) =>
      [
        `Prompt: ${prompt}`,
        context ? `Server:\n${context}` : "",
        `Output: ${JSON.stringify(output)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n");
