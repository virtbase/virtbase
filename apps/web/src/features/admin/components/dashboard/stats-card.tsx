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

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useFormatter } from "next-intl";
import type React from "react";
import { Suspense, use } from "react";
import { ErrorBoundary } from "react-error-boundary";

export function StatsCard<T extends Record<string, number | bigint>>({
  title,
  promise,
  accessorKey,
  formatOptions,
  icon,
  description,
  subtext,
}: {
  title: string;
  promise: Promise<T>;
  accessorKey: keyof T;
  formatOptions?: Intl.NumberFormatOptions;
  icon: React.ReactNode;
  description: string;
  subtext?: string;
}) {
  return (
    <Card className="gap-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2 [&>svg]:shrink-0 [&>svg]:text-muted-foreground [>svg]:size-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="font-medium text-sm leading-none">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {icon}
      </CardHeader>
      <CardContent>
        <ErrorBoundary fallback={<Skeleton className="h-8 w-24" />}>
          <Suspense fallback={<Skeleton className="h-8 w-24" />}>
            <StatsCardCount
              promise={promise}
              accessorKey={accessorKey}
              formatOptions={formatOptions}
            />
          </Suspense>
        </ErrorBoundary>
        {subtext && <p className="text-muted-foreground text-xs">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

export function StatsCardCount<T extends Record<string, number | bigint>>({
  promise,
  formatOptions,
  accessorKey,
}: {
  promise: Promise<T>;
  accessorKey: keyof T;
  formatOptions?: Intl.NumberFormatOptions;
}) {
  const data = use<T>(promise);
  const formatter = useFormatter();

  return (
    <span className="font-bold text-2xl">
      {formatter.number(data[accessorKey] as number | bigint, formatOptions)}
    </span>
  );
}
