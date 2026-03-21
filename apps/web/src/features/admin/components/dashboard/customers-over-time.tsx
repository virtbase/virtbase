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
import { UsersIcon } from "@virtbase/ui/icons";
import { useExtracted, useFormatter } from "next-intl";
import { use } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from "recharts";
import type { getCustomersOverTime } from "../../api/dashboard/get-customers-over-time";

export function CustomersOverTime({
  promise,
}: {
  promise: ReturnType<typeof getCustomersOverTime>;
}) {
  const data = use(promise);

  const t = useExtracted();
  const format = useFormatter();

  return (
    <ChartContainer
      config={{
        count: {
          label: t("New Customers"),
          icon: UsersIcon,
          color: "var(--primary)",
        },
      }}
    >
      <BarChart
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
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              valueFormatter={(_, value) => format.number(value as number)}
              className="w-40"
              hideLabel
            />
          }
        />
        <Bar
          dataKey="count"
          fill="var(--color-count)"
          minPointSize={1}
          radius={8}
        >
          <LabelList
            position="top"
            offset={12}
            className="fill-foreground"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
