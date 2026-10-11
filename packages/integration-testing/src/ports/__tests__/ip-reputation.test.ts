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
import type { IpReputationProvider } from "@virtbase/ports";
import {
  describeIpReputationProvider,
  runIpReputationContract,
} from "../ip-reputation";

/** A reference provider; `rawScore` breaks it by passing a provider's own scale through. */
const referenceProvider = async ({ rawScore = false } = {}) => {
  const provider: IpReputationProvider = {
    id: "reference",
    check: async (ip) => ({
      ip,
      score: rawScore ? 870 : 87,
      categories: ["port_scan"],
      totalReports: 4,
      lastReportedAt: new Date("2026-10-11T00:00:00Z"),
    }),
  };
  return { provider, reportedIp: "192.0.2.7" };
};

describeIpReputationProvider("the reference provider", () =>
  referenceProvider(),
);

describe("runIpReputationContract", () => {
  test("fails a provider whose score is not 0-100", async () => {
    expect(
      (
        await runIpReputationContract(() =>
          referenceProvider({ rawScore: true }),
        )
      ).map((failure) => failure.slice(0, failure.indexOf(":"))),
    ).toEqual(["check() normalises the score to 0-100 and counts the reports"]);
  });
});
