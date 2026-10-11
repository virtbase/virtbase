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
import type { MetricsSink } from "@virtbase/ports";
import { describeMetricsSink, runMetricsContract } from "../metrics";

/** A sink that keeps the contract, unless told to throw on a non-finite value. */
const referenceSink = async ({ throwsOnNaN = false } = {}) => {
  const check = (value: number) => {
    if (throwsOnNaN && !Number.isFinite(value)) throw new Error("not finite");
  };
  const sink: MetricsSink = {
    increment: (_, by = 1) => check(by),
    gauge: (_, value) => check(value),
    observe: (_, value) => check(value),
  };
  return { sink };
};

describeMetricsSink("the reference sink", () => referenceSink());

describe("runMetricsContract", () => {
  test("fails a sink that throws on a value that is not finite", async () => {
    expect(
      (
        await runMetricsContract(() => referenceSink({ throwsOnNaN: true }))
      ).map((failure) => failure.slice(0, failure.indexOf(":"))),
    ).toEqual(["accepts a value that is not finite without throwing"]);
  });

  test("fails a sink whose flush() rejects", async () => {
    expect(
      (
        await runMetricsContract(async () => ({
          sink: {
            ...(
              await referenceSink()
            ).sink,
            flush: async () => {
              throw new Error("backend down");
            },
          },
        }))
      ).map((failure) => failure.slice(0, failure.indexOf(":"))),
    ).toEqual(["flush(), where present, resolves"]);
  });
});
