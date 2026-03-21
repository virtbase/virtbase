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
import { Button } from "@virtbase/ui/button";
import { Card, CardContent, CardHeader } from "@virtbase/ui/card";
import type { ChartConfig } from "@virtbase/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  XAxis,
} from "@virtbase/ui/chart";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import { LucideCalendarClock } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { formatBytes } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted, useFormatter } from "next-intl";
import { parseAsStringEnum, useQueryState } from "nuqs";
import type React from "react";
import { Fragment } from "react";
import { useServerGraphs } from "../hooks/use-server-graphs";

type ServerGraphsChartConfig = Record<
  "cpu" | "memory" | "disk" | "network",
  { name: string; config: ChartConfig }
>;

type Timeframe = "hour" | "day" | "week" | "month" | "year";

export default function ServerGraphs({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  const t = useExtracted();
  const format = useFormatter();

  const [activeTimeframe, setActiveTimeframe] = useQueryState<Timeframe>(
    "timeframe",
    parseAsStringEnum(["hour", "day", "week", "month", "year"]).withDefault(
      "hour",
    ),
  );

  const [activeChart, setActiveChart] = useQueryState(
    "chart",
    parseAsStringEnum(["cpu", "memory", "disk", "network"]).withDefault("cpu"),
  );

  const { id: serverId } = useParams<{ id: string }>();
  const { data: { data: chartData } = { data: [] }, isPending } =
    useServerGraphs({
      server_id: serverId,
      timeframe: activeTimeframe,
      cf: "AVERAGE",
    });

  const timeframeMapping = {
    day: t("Days"),
    hour: t("Hours"),
    week: t("Weeks"),
    month: t("Months"),
    year: t("Years"),
  } as Record<Timeframe, string>;

  const timeframeLabel = timeframeMapping[activeTimeframe];

  const charts: ServerGraphsChartConfig = {
    cpu: {
      name: t("CPU"),
      config: {
        cpu: {
          label: t("CPU (%)"),
          color: "var(--chart-2)",
        },
      },
    },
    memory: {
      name: t("RAM"),
      config: {
        mem: {
          label: t("Used"),
          color: "var(--chart-1)",
        },
        maxmem: {
          label: t("Max"),
          color: "var(--chart-2)",
        },
      },
    },
    disk: {
      name: t("Disk"),
      config: {
        diskread: {
          label: t("Read"),
          color: "var(--chart-1)",
        },
        diskwrite: {
          label: t("Write"),
          color: "var(--chart-2)",
        },
      },
    },
    network: {
      name: t("Network"),
      config: {
        netin: {
          label: t("Incoming"),
          color: "var(--chart-1)",
        },
        netout: {
          label: t("Outgoing"),
          color: "var(--chart-2)",
        },
      },
    },
  };

  return (
    <Card className={cn("gap-0 overflow-hidden pt-0", className)} {...props}>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b lg:flex-row [.border-b]:p-0">
        <div className="inline-flex flex-1 gap-1 px-6 py-5 lg:py-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <LucideCalendarClock aria-hidden />
                {timeframeLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{t("Intervall")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["hour", "day", "week", "month", "year"].map((value) => {
                const timeframe = value as Timeframe;
                return (
                  <DropdownMenuCheckboxItem
                    key={value}
                    onCheckedChange={() => setActiveTimeframe(timeframe)}
                    checked={activeTimeframe === value}
                  >
                    {timeframeMapping[timeframe]}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4">
          {["cpu", "memory", "disk", "network"].map((key) => {
            const chart = key as keyof typeof charts;
            return (
              <button
                type="button"
                key={chart}
                data-active={activeChart === chart}
                className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t border-l px-6 py-4 text-left outline-none first:border-l-0 focus-visible:ring-2 focus-visible:ring-ring/50 data-[active=true]:bg-accent/40 lg:border-t-0 lg:px-8 lg:py-6 lg:first:border-l"
                onClick={() => setActiveChart(chart)}
              >
                <span className="font-bold text-sm leading-none">
                  {charts[chart].name}
                </span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-2">
        <div className="relative isolate aspect-auto h-72 w-full">
          {isPending ? (
            <div className="absolute inset-0 grid size-full place-items-center">
              <Spinner />
            </div>
          ) : (
            <ChartContainer
              className="absolute inset-0 size-full"
              config={charts[activeChart].config}
            >
              <AreaChart
                accessibilityLayer
                data={chartData}
                margin={{
                  top: 12,
                  left: 12,
                  right: 12,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={(value: number) => {
                    const date = new Date(value * 1000);
                    return format.dateTime(date, {
                      year: activeTimeframe === "year" ? "numeric" : undefined,
                      month: activeTimeframe !== "hour" ? "2-digit" : undefined,
                      day: activeTimeframe !== "hour" ? "2-digit" : undefined,
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      className="w-52"
                      indicator="line"
                      cursor={false}
                      labelFormatter={(_, data) => {
                        if (!data?.[0]) {
                          return null;
                        }

                        const value = (data[0].payload as { time: number })
                          .time;
                        return format.dateTime(value * 1000, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        });
                      }}
                      valueFormatter={(key, value) => {
                        if (key === "cpu") {
                          return format.number(value as number, {
                            style: "percent",
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2,
                          });
                        }

                        return formatBytes(value as number, {
                          formatter: format,
                        });
                      }}
                    />
                  }
                />

                {Object.entries(charts[activeChart].config).map(
                  ([key, { color }]) => {
                    return (
                      <Fragment key={key}>
                        <defs>
                          <linearGradient
                            id={`fill-${key}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={color}
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor={color}
                              stopOpacity={0.1}
                            />
                          </linearGradient>
                        </defs>
                        <Area
                          dataKey={key}
                          stroke={color}
                          fill={`url(#fill-${key})`}
                          type="monotone"
                          stackId={key}
                        />
                      </Fragment>
                    );
                  },
                )}
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
