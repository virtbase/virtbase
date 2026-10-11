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
import type { MetricSample, MetricsSink } from "@virtbase/ports";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";

/** What the `metrics` contract suite needs from an integration's tests. */
export interface MetricsContractSetup {
  /** The sink under test, recording into a fresh backend. */
  sink: MetricsSink;
}

/** Records each call in turn; the port promises none of them throws. */
const recordAll = (sink: MetricsSink, samples: readonly MetricSample[]) => {
  for (const sample of samples) {
    sink.increment(sample);
    sink.gauge(sample, 1);
    sink.observe(sample, 1);
  }
};

const METRICS_CHECKS: Check<MetricsContractSetup>[] = [
  {
    title: "records a count, a value and a duration without throwing",
    run: ({ sink }) => {
      expect(() => {
        sink.increment({ name: "contract.provisioned" });
        sink.increment({ name: "contract.provisioned" }, 3);
        sink.gauge({ name: "contract.running" }, 7);
        sink.observe({ name: "contract.duration" }, 250);
      }).not.toThrow();
    },
  },
  {
    title: "accepts a name its backend cannot store without throwing",
    run: ({ sink }) => {
      expect(() =>
        recordAll(sink, [{ name: "" }, { name: "9 bad name!" }, { name: "…" }]),
      ).not.toThrow();
    },
  },
  {
    title: "accepts a value that is not finite without throwing",
    run: ({ sink }) => {
      expect(() => {
        for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
          sink.increment({ name: "contract.not_finite" }, value);
          sink.gauge({ name: "contract.not_finite_gauge" }, value);
          sink.observe({ name: "contract.not_finite_duration" }, value);
        }
      }).not.toThrow();
    },
  },
  {
    title: "accepts one name through two methods without throwing",
    run: ({ sink }) => {
      expect(() => {
        sink.increment({ name: "contract.mixed" });
        sink.gauge({ name: "contract.mixed" }, 1);
        sink.observe({ name: "contract.mixed" }, 1);
      }).not.toThrow();
    },
  },
  {
    title: "accepts labels that change between samples without throwing",
    run: ({ sink }) => {
      expect(() => {
        sink.increment({ name: "contract.labelled" });
        sink.increment({ name: "contract.labelled", labels: { node: "a" } });
        sink.increment({
          name: "contract.labelled",
          labels: { node: "a", datacenter: "b" },
        });
      }).not.toThrow();
    },
  },
  {
    title: "flush(), where present, resolves",
    run: async ({ sink }) => {
      await sink.flush?.();
    },
  },
];

/**
 * The `metrics` port contract (§4.8 of integration-first.md): every sink runs
 * it against its own backend. `setup` runs before each check.
 *
 * The suite proves the promise `MetricsSink` makes: recording never fails the work
 * being measured, whatever the sample. What a backend stores is left to each
 * sink's own tests.
 */
export const describeMetricsSink = (
  name: string,
  setup: () => Promise<MetricsContractSetup>,
): void => describeChecks(`${name} provides metrics`, METRICS_CHECKS, setup);

/** Runs the `metrics` contract and returns one line per failed check, for the suite's own tests. */
export const runMetricsContract = (
  setup: () => Promise<MetricsContractSetup>,
): Promise<string[]> => runChecks(METRICS_CHECKS, setup);
