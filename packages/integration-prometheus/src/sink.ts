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

import type { IntegrationLogger } from "@virtbase/integration-sdk";
import type { MetricSample, MetricsSink } from "@virtbase/ports";
import {
  projectLabels,
  toCounterName,
  toLabelNames,
  toMetricName,
} from "./names";
import type { MetricsRuntime } from "./runtime";

/**
 * The `metrics` port, backed by a Prometheus registry this process serves on
 * its own scrape endpoint.
 *
 * Nothing here is allowed to throw. The port's contract is that recording a
 * measurement never fails the work being measured, so a bad metric name, a
 * label that arrived late or a value of `NaN` costs its own sample and a log
 * line — never the provisioning run that produced it.
 *
 * There is no `flush()`: samples are held in the registry until Prometheus
 * scrapes them, so there is nothing buffered for a caller to push.
 */
export class PrometheusMetricsSink implements MetricsSink {
  constructor(
    private readonly runtime: MetricsRuntime,
    private readonly logger: IntegrationLogger,
  ) {}

  increment(sample: MetricSample, by = 1): void {
    this.record("increment", sample, by, (name, labelNames) => {
      const counter = this.runtime.counter({
        name,
        help: helpFor(sample.name),
        labelNames,
      });
      if (!counter) return false;

      counter.inc(projectLabels(sample.labels, labelNames), by);
      return true;
    });
  }

  gauge(sample: MetricSample, value: number): void {
    this.record("gauge", sample, value, (name, labelNames) => {
      const gauge = this.runtime.gauge({
        name,
        help: helpFor(sample.name),
        labelNames,
      });
      if (!gauge) return false;

      gauge.set(projectLabels(sample.labels, labelNames), value);
      return true;
    });
  }

  observe(sample: MetricSample, value: number): void {
    this.record("observe", sample, value, (name, labelNames) => {
      const histogram = this.runtime.histogram({
        name,
        help: helpFor(sample.name),
        labelNames,
      });
      if (!histogram) return false;

      histogram.observe(projectLabels(sample.labels, labelNames), value);
      return true;
    });
  }

  /**
   * The parts every method shares: name translation, value validation, the
   * label set a metric was created with, and the promise not to throw.
   */
  private record(
    kind: "increment" | "gauge" | "observe",
    sample: MetricSample,
    value: number,
    apply: (name: string, labelNames: readonly string[]) => boolean,
  ): void {
    try {
      const name =
        kind === "increment"
          ? toCounterName(sample.name, this.runtime.prefix)
          : toMetricName(sample.name, this.runtime.prefix);

      if (!name) {
        this.runtime.warnOnce(
          `name:${sample.name}`,
          this.logger,
          `Dropped "${sample.name}": no valid Prometheus metric name remains after sanitising.`,
        );
        return;
      }

      if (!Number.isFinite(value)) {
        this.runtime.warnOnce(
          `value:${name}`,
          this.logger,
          `Dropped a non-finite value for "${name}".`,
        );
        return;
      }

      // A metric's label set is fixed when it is created, so the names of the
      // first sample win and later ones are projected onto them.
      const declared = this.runtime.labelNamesOf(name);
      const applied = apply(name, declared ?? toLabelNames(sample.labels));

      if (!applied) {
        this.runtime.warnOnce(
          `kind:${name}`,
          this.logger,
          `Dropped "${name}": already recorded as a different metric type. Use one of increment/gauge/observe per name.`,
        );
      }
    } catch (error) {
      // Deliberately swallowed. See the class comment: a metrics backend is
      // never allowed to fail the workflow that is reporting to it.
      this.runtime.warnOnce(
        `error:${sample.name}`,
        this.logger,
        `Failed to record "${sample.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function helpFor(sampleName: string): string {
  return `Recorded through the metrics port as "${sampleName}".`;
}
