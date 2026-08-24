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
import { GenerateServerFirewallRuleOutputSchema } from "@virtbase/validators/server";
import { repairGeneratedText } from "../generation";

/**
 * Runs a raw model response through the pipeline the router uses.
 *
 * Exercised with the mistakes models actually make rather than invented ones,
 * so the two outcomes that matter can be told apart: repaired silently, or
 * rejected so the SDK retries. What must never happen is a rule reaching the
 * customer that the firewall would refuse.
 */
const pipeline = (output: unknown) =>
  GenerateServerFirewallRuleOutputSchema.safeParse(
    JSON.parse(repairGeneratedText(JSON.stringify(output))),
  );

const wrap = (rules: unknown[]) => ({
  rules,
  description: "An explanation of the generated rules.",
});

const VALID = {
  direction: "in",
  action: "ACCEPT",
  proto: "tcp",
  dport: "443",
  comment: "Allow HTTPS",
};

describe("generation pipeline - repaired", () => {
  test("an ICMP type on a TCP rule is dropped", () => {
    const result = pipeline(wrap([{ ...VALID, icmp_type: "echo-request" }]));

    expect(result.success).toBe(true);
    expect(result.data?.rules[0]?.icmp_type).toBeUndefined();
  });

  test("ports on a protocol without ports are dropped", () => {
    const result = pipeline(
      wrap([
        {
          direction: "in",
          action: "ACCEPT",
          proto: "icmp",
          icmp_type: "echo-request",
          dport: "22",
          comment: "Allow ping",
        },
      ]),
    );

    expect(result.success).toBe(true);
    expect(result.data?.rules[0]?.dport).toBeUndefined();
  });

  test("a spaced port list is tidied", () => {
    const result = pipeline(wrap([{ ...VALID, dport: "80, 443" }]));

    expect(result.data?.rules[0]?.dport).toBe("80,443");
  });

  test("empty strings are treated as absent", () => {
    const result = pipeline(
      wrap([{ ...VALID, sport: "", source: "", icmp_type: "" }]),
    );

    expect(result.success).toBe(true);
    expect(result.data?.rules[0]?.sport).toBeUndefined();
  });

  test("an uppercase protocol is normalised", () => {
    const result = pipeline(wrap([{ ...VALID, proto: "TCP" }]));

    expect(result.data?.rules[0]?.proto).toBe("tcp");
  });
});

describe("generation pipeline - rejected", () => {
  const cases: [string, unknown][] = [
    ["a protocol that does not exist", wrap([{ ...VALID, proto: "https" }])],
    [
      "ports with no protocol, which the firewall cannot apply",
      wrap([
        { direction: "in", action: "ACCEPT", dport: "443", comment: "Web" },
      ]),
    ],
    [
      "an ICMP rule without its type",
      wrap([
        { direction: "in", action: "ACCEPT", proto: "icmp", comment: "Ping" },
      ]),
    ],
    [
      "`any` on ipv6-icmp, which has no such type",
      wrap([
        {
          direction: "in",
          action: "ACCEPT",
          proto: "ipv6-icmp",
          icmp_type: "any",
          comment: "Ping",
        },
      ]),
    ],
    [
      "a source that is not an address",
      wrap([{ ...VALID, source: "my-office-network" }]),
    ],
    ["an invalid action", wrap([{ ...VALID, action: "ALLOW" }])],
    ["a missing comment", wrap([{ ...VALID, comment: undefined }])],
    ["more than five rules", wrap(Array.from({ length: 6 }, () => VALID))],
  ];

  for (const [name, output] of cases) {
    test(`it rejects ${name}`, () => {
      expect(pipeline(output).success).toBe(false);
    });
  }
});

describe("generation pipeline - accepted", () => {
  test("no rules at all is a valid answer", () => {
    // Requiring at least one used to force the model to invent a rule for an
    // off-topic prompt, or for a request the server already satisfied.
    const result = pipeline(wrap([]));

    expect(result.success).toBe(true);
    expect(result.data?.rules).toEqual([]);
  });

  test("a source-restricted rule survives intact", () => {
    const result = pipeline(
      wrap([{ ...VALID, dport: "3306", source: "10.0.0.0/8" }]),
    );

    expect(result.success).toBe(true);
    expect(result.data?.rules[0]?.source).toBe("10.0.0.0/8");
  });

  test("an IPv6 source is accepted", () => {
    const result = pipeline(wrap([{ ...VALID, source: "2001:db8::/32" }]));

    expect(result.success).toBe(true);
  });
});

describe("repairGeneratedText", () => {
  test("it hands back text that is not JSON for the SDK to retry", () => {
    expect(repairGeneratedText("Sure! Here are your rules:")).toBe(
      "Sure! Here are your rules:",
    );
  });

  test("it leaves a payload without a rules array alone", () => {
    expect(repairGeneratedText('{"error":"nope"}')).toBe('{"error":"nope"}');
  });
});
