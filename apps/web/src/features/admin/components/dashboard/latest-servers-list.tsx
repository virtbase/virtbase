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

import { Badge } from "@virtbase/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideChevronRight,
  LucideServerOff,
  LucideTag,
} from "@virtbase/ui/icons";
import NextLink from "next/link";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { use } from "react";
import type { getLatestServers } from "@/features/admin/api/dashboard/get-latest-servers";
import { paths } from "@/lib/paths";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";

export function LatestServersList({
  promise,
}: {
  promise: ReturnType<typeof getLatestServers>;
}) {
  const servers = use(promise);

  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 1000 });

  if (!servers.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideServerOff aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No new servers")}</EmptyTitle>
          <EmptyDescription>
            {t("No new servers have been created yet.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="divide-y">
      {servers.map((server) => {
        const href = paths.admin.servers.getHref({ name: server.name });
        return (
          <div
            key={server.id}
            className="flex items-center justify-between gap-2 py-4 first:pt-0 last:pb-0"
          >
            <div className="flex items-center gap-2">
              <OperatingSystemIcon icon={server.icon} className="size-8" />
              <div className="flex flex-col">
                <div className="flex items-center space-x-1.5">
                  <NextLink
                    href={href}
                    className="truncate font-medium text-sm outline-none transition-all duration-300 hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    prefetch={false}
                  >
                    {server.name}
                  </NextLink>
                </div>
                <span className="font-light text-muted-foreground text-xs">
                  {format.relativeTime(server.createdAt, now)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 grow">
                <Badge variant="secondary">
                  <LucideTag aria-hidden="true" />
                  {server.plan}
                </Badge>
              </div>
              <NextLink
                href={href}
                className="shrink-0 outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                prefetch={false}
              >
                <LucideChevronRight
                  aria-hidden="true"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                />
              </NextLink>
            </div>
          </div>
        );
      })}
    </div>
  );
}
