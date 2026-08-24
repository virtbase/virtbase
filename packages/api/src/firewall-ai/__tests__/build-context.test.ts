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

import { describe, expect, test } from "bun:test";
import type { ListeningSocket } from "@virtbase/utils";
import { buildGenerationContext } from "../build-context";
import { buildSystemPrompt } from "../system-prompt";

const socket = (
  port: number,
  overrides: Partial<ListeningSocket> = {},
): ListeningSocket => ({
  protocol: "tcp",
  address: "0.0.0.0",
  port,
  scope: "wildcard",
  family: "ipv4",
  processes: [],
  raw: "",
  ...overrides,
});

const base = {
  os: null,
  policyIn: "ACCEPT",
  policyOut: "ACCEPT",
  rules: [],
  sockets: [],
  guestManager: null,
};

describe("buildGenerationContext", () => {
  test("it states the default policy", () => {
    expect(buildGenerationContext(base)).toContain(
      "Default policy: incoming ACCEPT, outgoing ACCEPT",
    );
  });

  test("it says unknown rather than guessing a missing policy", () => {
    expect(
      buildGenerationContext({ ...base, policyIn: null, policyOut: null }),
    ).toContain("incoming unknown, outgoing unknown");
  });

  test("it lists existing rules in evaluation order with their meaning", () => {
    const context = buildGenerationContext({
      ...base,
      rules: [
        {
          pos: 0,
          enabled: true,
          direction: "in",
          action: "ACCEPT",
          proto: "tcp",
          dport: "443",
          comment: "Allow HTTPS",
        },
        {
          pos: 1,
          enabled: false,
          direction: "in",
          action: "DROP",
          proto: "tcp",
          dport: "22",
        },
      ],
    });

    expect(context).toContain("first match wins");
    expect(context).toContain("1. in ACCEPT tcp dport 443 - Allow HTTPS");
    // A disabled rule is not the same as an absent one; the model needs to know
    // it is there before proposing a duplicate.
    expect(context).toContain("2. (disabled) in DROP tcp dport 22");
  });

  test("it includes a source restriction", () => {
    const context = buildGenerationContext({
      ...base,
      rules: [
        {
          pos: 0,
          enabled: true,
          direction: "in",
          action: "ACCEPT",
          proto: "tcp",
          dport: "3306",
          source: "10.0.0.0/8",
        },
      ],
    });

    expect(context).toContain("from 10.0.0.0/8");
  });

  test("it separates internet-facing ports from loopback ones", () => {
    // The distinction the model most needs: a rule for a loopback-only service
    // achieves nothing.
    const context = buildGenerationContext({
      ...base,
      sockets: [
        socket(22, { processes: [{ name: "sshd", pid: 1 }] }),
        socket(3306, {
          address: "127.0.0.1",
          scope: "loopback",
          processes: [{ name: "mariadbd", pid: 2 }],
        }),
      ],
    });

    expect(context).toContain("Listening on all interfaces: 22/tcp (sshd)");
    expect(context).toContain("loopback only");
    expect(context).toContain("3306/tcp (mariadbd)");
  });

  test("it collapses a service bound to both address families", () => {
    const context = buildGenerationContext({
      ...base,
      sockets: [
        socket(22, { address: "0.0.0.0" }),
        socket(22, { address: "::", family: "ipv6" }),
      ],
    });

    expect(context.match(/22\/tcp/g)).toHaveLength(1);
  });

  test("it admits when the server could not be inspected", () => {
    // So the model says it could not check, instead of asserting what is
    // running on a server nobody looked at.
    const context = buildGenerationContext({ ...base, sockets: null });

    expect(context).toContain("could not be inspected");
    expect(context).not.toContain("Listening on all interfaces:");
  });

  test("it mentions a second firewall inside the server", () => {
    expect(buildGenerationContext({ ...base, guestManager: "ufw" })).toContain(
      "second firewall runs inside the server (ufw)",
    );
  });

  test("it omits the operating system when unknown", () => {
    expect(buildGenerationContext(base)).not.toContain("Operating system");
    expect(
      buildGenerationContext({ ...base, os: "Debian GNU/Linux 12" }),
    ).toContain("Operating system: Debian GNU/Linux 12");
  });
});

describe("buildSystemPrompt", () => {
  test("it teaches the rules the schema enforces", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("first match wins");
    expect(prompt).toContain("'any' is valid for 'icmp' only");
    expect(prompt).toContain("Prefer DROP over REJECT");
  });

  test("it shows that returning no rules is a valid answer", () => {
    // The failure this prevents: inventing a rule for an off-topic prompt.
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('"rules":[]');
    expect(prompt).toContain("return none when none are needed");
  });

  test("it pins the output language when a locale is given", () => {
    expect(buildSystemPrompt("de")).toContain("in this language: de");
    expect(buildSystemPrompt()).toContain("language of the prompt");
  });
});
