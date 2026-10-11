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
import type { AbusePollResult, AbuseSource } from "@virtbase/ports";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";

/** What the `abuse` contract suite needs from an integration's tests. */
export interface AbuseContractSetup {
  /** The source under test, talking to a fresh fake provider. */
  source: AbuseSource;
  /** At least two ranges the fake provider holds findings for. */
  targets: { cidr: string }[];
  /** How many calls reached the fake provider. */
  calls(): number;
}

const poll = (
  { source, targets }: AbuseContractSetup,
  budget: number,
): Promise<AbusePollResult> => {
  if (!source.poll) throw new Error(`${source.id} has no poll()`);
  if (targets.length < 2) throw new Error("the setup must offer two targets");
  return source.poll({ since: new Date(0), targets, budget });
};

const ABUSE_CHECKS: Check<AbuseContractSetup>[] = [
  {
    title: "poll() covers only the targets it was given",
    run: async (context) => {
      const offered = context.targets.map(({ cidr }) => cidr);
      const { covered } = await poll(context, 100);
      expect(covered.every((cidr) => offered.includes(cidr))).toBe(true);
      expect(covered.length).toBeGreaterThan(0);
    },
  },
  {
    title: "poll() makes no more provider calls than its budget",
    run: async (context) => {
      await poll(context, 1);
      expect(context.calls()).toBeLessThanOrEqual(1);
    },
  },
  {
    title: "poll() with a budget of zero calls nothing and covers nothing",
    run: async (context) => {
      const { covered } = await poll(context, 0);
      expect(context.calls()).toBe(0);
      expect(covered).toEqual([]);
    },
  },
  {
    title: "every signal names the source and carries an external id",
    run: async (context) => {
      const { signals } = await poll(context, 100);
      expect(signals.length).toBeGreaterThan(0);
      for (const signal of signals) {
        expect(signal.source).toBe(context.source.id);
        expect(signal.externalId).toBeTruthy();
      }
    },
  },
  {
    title:
      "a repeated poll yields the same external ids, so the intake deduplicates",
    run: async (context) => {
      const ids = async () =>
        (await poll(context, 100)).signals
          .map((signal) => signal.externalId)
          .sort();
      expect(await ids()).toEqual(await ids());
    },
  },
];

/**
 * The `abuse` port contract (§4.8 of integration-first.md): every source runs
 * it against its own fake provider. `setup` runs before each check.
 *
 * It proves the promises of `AbuseSource`: `covered` is a subset of the
 * targets, the budget caps provider calls, and signals carry their source and
 * a stable external id.
 */
export const describeAbuseSource = (
  name: string,
  setup: () => Promise<AbuseContractSetup>,
): void => describeChecks(`${name} provides abuse`, ABUSE_CHECKS, setup);

/** Runs the `abuse` contract and returns one line per failed check, for the suite's own tests. */
export const runAbuseContract = (
  setup: () => Promise<AbuseContractSetup>,
): Promise<string[]> => runChecks(ABUSE_CHECKS, setup);
