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

import type { ChartConfig } from "@virtbase/ui/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@virtbase/ui/chart";
import { useExtracted, useFormatter } from "next-intl";
import React, { use } from "react";
import { Label, Pie, PieChart } from "recharts";
import type { getSalesByPlan } from "../../api/dashboard/get-sales-by-plan";

export function SalesByPlan({
  promise,
}: {
  promise: ReturnType<typeof getSalesByPlan>;
}) {
  const data = use(promise);

  const t = useExtracted();
  const format = useFormatter();

  const totalSales = React.useMemo(
    () => data.reduce((acc, item) => acc + item.count, 0),
    [data],
  );

  const config = Object.assign(
    {},
    ...data.map(
      (item, index) =>
        ({
          [index]: {
            label: item.name,
            color: `color-mix(in oklch, var(--foreground) ${100 - (index % 5) * 10}%, transparent)`,
          },
        }) satisfies ChartConfig,
    ),
  );

  return (
    <ChartContainer
      config={{
        ...config,
        revenue: {
          label: t("Revenue"),
        },
      }}
      className="mx-auto max-h-72 px-0"
    >
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              className="w-40"
              valueFormatter={(_, value) => format.number(value as number)}
              hideLabel
            />
          }
        />
        <Pie
          data={data.map((item, index) => ({
            ...item,
            fill: `var(--color-${index})`,
          }))}
          dataKey="count"
          labelLine={false}
          label={({ payload, ...props }) => {
            return (
              <text
                cx={props.cx}
                cy={props.cy}
                x={props.x}
                y={props.y}
                textAnchor={props.textAnchor}
                dominantBaseline={props.dominantBaseline}
                fill="var(--foreground)"
              >
                {payload.name}
              </text>
            );
          }}
          innerRadius={60}
          strokeWidth={5}
        >
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy}
                      className="fill-foreground font-bold text-3xl"
                    >
                      {format.number(totalSales)}
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy || 0) + 24}
                      className="fill-muted-foreground"
                    >
                      {t("Sales")}
                    </tspan>
                  </text>
                );
              }
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
