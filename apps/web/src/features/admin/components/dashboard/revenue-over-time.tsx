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

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@virtbase/ui/chart";
import { LucideEuro } from "@virtbase/ui/icons";
import { useExtracted, useFormatter } from "next-intl";
import { use } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { getRevenueOverTime } from "../../api/dashboard/get-revenue-over-time";

export function RevenueOverTime({
  promise,
}: {
  promise: ReturnType<typeof getRevenueOverTime>;
}) {
  const data = use(promise);

  const t = useExtracted();
  const format = useFormatter();

  return (
    <ChartContainer
      config={{
        amount: {
          label: t("Revenue"),
          icon: LucideEuro,
          color: "var(--primary)",
        },
      }}
    >
      <LineChart
        data={data}
        accessibilityLayer
        margin={{
          top: 20,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={(value: string) =>
            format.dateTime(new Date(value), {
              day: "numeric",
              month: "numeric",
            })
          }
        />
        <YAxis
          dataKey="amount"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tickFormatter={(value: number) =>
            format.number(value / 100, {
              style: "currency",
              currency: "EUR",
            })
          }
          orientation="right"
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              valueFormatter={(_, value) =>
                format.number((value as number) / 100, {
                  style: "currency",
                  currency: "EUR",
                })
              }
              className="w-40"
            />
          }
        />
        <Line
          dataKey="amount"
          type="linear"
          stroke="var(--color-amount)"
          fill="var(--color-amount)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
