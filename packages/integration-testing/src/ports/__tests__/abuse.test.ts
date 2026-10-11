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
import type { AbuseSource } from "@virtbase/ports";
import { describeAbuseSource, runAbuseContract } from "../abuse";

/**
 * A reference source: one finding per target, one call per target.
 * `ignoreBudget` breaks it the way a careless source would.
 */
const referenceSource = async ({ ignoreBudget = false } = {}) => {
  let calls = 0;
  const source: AbuseSource = {
    id: "reference",
    poll: async ({ targets, budget }) => {
      const covered: string[] = [];
      for (const { cidr } of targets) {
        if (!ignoreBudget && calls >= budget) break;
        calls++;
        covered.push(cidr);
      }
      return {
        covered,
        signals: covered.map((cidr) => ({
          source: "reference",
          externalId: `${cidr}:2026-10-11`,
          type: "abuse.other",
          state: "firing" as const,
          severity: "warning" as const,
          subject: { kind: "ip" as const, value: cidr.split("/")[0] ?? cidr },
          title: `${cidr} reported`,
          occurredAt: new Date("2026-10-11T00:00:00Z"),
        })),
      };
    },
  };
  return {
    source,
    targets: [{ cidr: "10.0.0.0/24" }, { cidr: "10.0.1.0/24" }],
    calls: () => calls,
  };
};

describeAbuseSource("the reference source", () => referenceSource());

describe("runAbuseContract", () => {
  test("fails a source that ignores its budget", async () => {
    expect(
      (
        await runAbuseContract(() => referenceSource({ ignoreBudget: true }))
      ).map((failure) => failure.slice(0, failure.indexOf(":"))),
    ).toEqual([
      "poll() makes no more provider calls than its budget",
      "poll() with a budget of zero calls nothing and covers nothing",
    ]);
  });
});
