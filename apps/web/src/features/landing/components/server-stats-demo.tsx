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

import { Card, CardContent, CardHeader, CardTitle } from "@virtbase/ui/card";
import {
  LucideClock,
  LucideCpu,
  LucideDatabase,
  LucideDownload,
  LucideMemoryStick,
  LucideNetwork,
  LucideUpload,
} from "@virtbase/ui/icons";
import { Progress } from "@virtbase/ui/progress";
import type { Locale } from "next-intl";
import { getExtracted, getFormatter, getNow } from "next-intl/server";
import type React from "react";
import { formatBytes } from "@/lib/format-bytes";

export default async function ServerStatsDemo({
  locale,
  ...props
}: { locale: Locale } & React.ComponentProps<typeof Card>) {
  "use cache";

  const t = await getExtracted({
    locale,
  });

  const now = await getNow({
    locale,
  });
  const formatter = await getFormatter({
    locale,
  });

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>{t("Auslastung")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid items-center gap-3 lg:grid-cols-[230px_1fr]">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-2">
              <LucideCpu
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-medium">{t("CPU")}</span>
            </div>
            <div className="font-semibold text-sm">
              <span>
                {formatter.number(0.1337, {
                  style: "percent",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-muted-foreground"> / 4 vCores</span>
            </div>
          </div>
          <Progress value={13.37} max={100} />
        </div>
        <div className="grid items-center gap-3 lg:grid-cols-[230px_1fr]">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-2">
              <LucideMemoryStick
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-medium">{t("RAM")}</span>
            </div>
            <div className="font-semibold text-sm">
              <span>{formatBytes(6969 * 1024 * 1024, { formatter })}</span>
              <span className="text-muted-foreground">
                {" "}
                / {formatBytes(16384 * 1024 * 1024, { formatter })}
              </span>
            </div>
          </div>
          <Progress value={42} max={100} />
        </div>
        <div className="grid items-center gap-3 lg:grid-cols-[230px_1fr]">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-2">
              <LucideDatabase
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-medium">{t("Festplatte")}</span>
            </div>
            <div className="font-semibold text-sm">
              <span>
                {formatBytes(52.5 * 1024 * 1024 * 1024, { formatter })}
              </span>
              <span className="text-muted-foreground">
                {" "}
                / {formatBytes(1024 * 1024 * 1024 * 1024, { formatter })}
              </span>
            </div>
          </div>
          <Progress value={5} max={100} />
        </div>
        <div className="grid items-center gap-3 lg:grid-cols-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-2">
              <LucideNetwork
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-medium">{t("Netzwerk")}</span>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 font-semibold text-sm lg:justify-end">
            <div className="inline-flex items-center gap-1">
              <LucideDownload
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span>
                {formatBytes(30.69 * 1024 * 1024 * 1024, { formatter })}
              </span>
            </div>
            <div className="inline-flex items-center gap-1">
              <LucideUpload
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span>
                {formatBytes(15.34 * 1024 * 1024 * 1024, { formatter })}
              </span>
            </div>
          </div>
        </div>
        <div className="grid items-center gap-3 lg:grid-cols-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-2">
              <LucideClock
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-medium">{t("Letzter Neustart")}</span>
            </div>
          </div>
          <div className="inline-flex items-center font-semibold text-sm lg:justify-end">
            {formatter.relativeTime(now.getTime() - 3600 * 1000 * 3, now)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
