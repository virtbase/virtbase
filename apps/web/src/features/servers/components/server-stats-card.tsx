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
import { formatBytes } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { useServerStatus } from "../hooks/use-server-status";

export function ServerStatsCard(props: React.ComponentProps<typeof Card>) {
  const t = useExtracted();

  const now = useNow({ updateInterval: 1000 });
  const formatter = useFormatter();

  const { id: serverId } = useParams<{ id: string }>();
  const {
    data: { status } = {
      status: {
        stats: {
          cpu: 0,
          mem: 0,
          maxmem: 0,
          disk: 0,
          maxdisk: 0,
          netin: 0,
          netout: 0,
          uptime: 0,
          cpus: 0,
        },
      },
    },
  } = useServerStatus({
    server_id: serverId,
    with_storage_usage: true,
  });

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>{t("Usage")}</CardTitle>
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
                {formatter.number(Math.min(status.stats.cpu ?? 0, 1), {
                  style: "percent",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-muted-foreground">
                {" "}
                / {status.stats.cpus} {t("vCores")}
              </span>
            </div>
          </div>
          <Progress
            value={Math.min((status.stats.cpu ?? 0) * 100, 100)}
            max={100}
          />
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
              <span>{formatBytes(status.stats.mem ?? 0, { formatter })}</span>
              <span className="text-muted-foreground">
                {" "}
                / {formatBytes(status.stats.maxmem ?? 0, { formatter })}
              </span>
            </div>
          </div>
          <Progress
            value={((status.stats.mem ?? 0) / (status.stats.maxmem ?? 0)) * 100}
            max={100}
          />
        </div>
        <div className="grid items-center gap-3 lg:grid-cols-[230px_1fr]">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-2">
              <LucideDatabase
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-medium">{t("Disk")}</span>
            </div>
            <div className="font-semibold text-sm">
              <span>{formatBytes(status.stats.disk ?? 0, { formatter })}</span>
              <span className="text-muted-foreground">
                {" "}
                / {formatBytes(status.stats.maxdisk ?? 0, { formatter })}
              </span>
            </div>
          </div>
          <Progress
            value={
              ((status.stats.disk ?? 0) / (status.stats.maxdisk ?? 0)) * 100
            }
            max={100}
          />
        </div>
        <div className="grid items-center gap-3 lg:grid-cols-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-2">
              <LucideNetwork
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-medium">{t("Network")}</span>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 font-semibold text-sm lg:justify-end">
            <div className="inline-flex items-center gap-1">
              <LucideDownload
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span>{formatBytes(status.stats.netin ?? 0, { formatter })}</span>
            </div>
            <div className="inline-flex items-center gap-1">
              <LucideUpload
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span>
                {formatBytes(status.stats.netout ?? 0, { formatter })}
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
              <span className="font-medium">{t("Last reboot")}</span>
            </div>
          </div>
          <div className="inline-flex items-center font-semibold text-sm lg:justify-end">
            {!status.stats.uptime
              ? t("N/A")
              : formatter.relativeTime(
                  now.getTime() - status.stats.uptime * 1000,
                  now,
                )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
