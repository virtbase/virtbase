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

import { expect } from "bun:test";
import type { IpReputationProvider } from "@virtbase/ports";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";

/** What the `ipReputation` contract suite needs from an integration's tests. */
export interface IpReputationContractSetup {
  /** The provider under test, talking to a fresh fake. */
  provider: IpReputationProvider;
  /** An address the fake holds reports for. */
  reportedIp: string;
}

const IP_REPUTATION_CHECKS: Check<IpReputationContractSetup>[] = [
  {
    title: "check() answers for the address it was asked about",
    run: async ({ provider, reportedIp }) => {
      expect((await provider.check(reportedIp)).ip).toBe(reportedIp);
    },
  },
  {
    title: "check() normalises the score to 0-100 and counts the reports",
    run: async ({ provider, reportedIp }) => {
      const reputation = await provider.check(reportedIp);
      expect(reputation.score).toBeGreaterThanOrEqual(0);
      expect(reputation.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(reputation.totalReports)).toBe(true);
      expect(reputation.totalReports).toBeGreaterThanOrEqual(0);
    },
  },
  {
    title:
      "check() gives categories as names and the last report as a Date or null",
    run: async ({ provider, reportedIp }) => {
      const reputation = await provider.check(reportedIp);
      expect(
        reputation.categories.every((category) => typeof category === "string"),
      ).toBe(true);
      expect(
        reputation.lastReportedAt === null ||
          reputation.lastReportedAt instanceof Date,
      ).toBe(true);
    },
  },
];

/**
 * The `ipReputation` port contract (§4.8 of integration-first.md): every
 * provider runs it against its own fake. `setup` runs before each check.
 *
 * It proves the shape `IpReputation` promises; `report()`, which is
 * optional and never automatic, is left to each provider's own tests.
 */
export const describeIpReputationProvider = (
  name: string,
  setup: () => Promise<IpReputationContractSetup>,
): void =>
  describeChecks(`${name} provides ipReputation`, IP_REPUTATION_CHECKS, setup);

/** Runs the `ipReputation` contract and returns one line per failed check, for the suite's own tests. */
export const runIpReputationContract = (
  setup: () => Promise<IpReputationContractSetup>,
): Promise<string[]> => runChecks(IP_REPUTATION_CHECKS, setup);
