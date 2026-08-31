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

"use client";

import { cn } from "@virtbase/ui";
import {
  LucideCpu,
  LucideHardDrive,
  LucideMemoryStick,
  LucideNetwork,
} from "@virtbase/ui/icons";
import { formatBits, formatBytes } from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";

/** The four numbers every plan row on this page is described by. */
export interface PlanSpecsShape {
  cores: number;
  memory: number;
  storage: number;
  netrate: number | null;
}

/**
 * What a plan is, in four facts.
 *
 * One component rather than the same four `formatBytes` calls written out at
 * every surface that shows a plan: the catalogue rows, the order dialog and
 * the headline of the current plan. Any two of them disagreeing about whether
 * 8192 MB is "8 GB" or "8.19 GB" is the kind of drift nobody notices until a
 * customer does.
 *
 * `netrate` is dropped rather than rendered as "—" when a plan has none: an
 * absent uplink figure is not a fact about the plan.
 */
export function PlanSpecs({
  plan,
  orientation = "row",
  className,
}: {
  plan: PlanSpecsShape;
  /** `row` wraps chips across the width; `list` stacks them in a column. */
  orientation?: "row" | "list";
  className?: string;
}) {
  const t = useExtracted();
  const format = useFormatter();

  const specs = [
    {
      key: "cores",
      icon: LucideCpu,
      label: t("{cores, plural, =0 {# vCores} =1 {# vCore} other {# vCores}}", {
        cores: plan.cores,
      }),
    },
    {
      key: "memory",
      icon: LucideMemoryStick,
      label: t("{memory} RAM", {
        memory: formatBytes(plan.memory * 1024 * 1024, { formatter: format }),
      }),
    },
    {
      key: "storage",
      icon: LucideHardDrive,
      label: t("{storage} NVMe SSD", {
        storage: formatBytes(plan.storage * 1024 * 1024 * 1024, {
          formatter: format,
        }),
      }),
    },
    ...(plan.netrate === null
      ? []
      : [
          {
            key: "netrate",
            icon: LucideNetwork,
            label: formatBits(plan.netrate * 1e6 * 8, {
              formatter: format,
              perSecond: true,
              base: 1000,
              unit: "gigabit",
            }),
          },
        ]),
  ];

  return (
    <ul
      data-testid="plan-specs"
      className={cn(
        "text-muted-foreground text-sm",
        orientation === "row"
          ? "flex flex-wrap items-center gap-x-4 gap-y-1.5"
          : "flex flex-col gap-2",
        className,
      )}
    >
      {specs.map((spec) => (
        <li key={spec.key} className="flex items-center gap-2">
          <spec.icon
            className="size-4 shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span>{spec.label}</span>
        </li>
      ))}
    </ul>
  );
}
