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

import { LucideChevronRight } from "@virtbase/ui/icons";
import NextLink from "next/link";
import { paths } from "@/lib/paths";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import { useLatestServers } from "../hooks/use-latest-servers";
import { EmptyServers } from "./empty-servers";
import { ServerStatusSmall } from "./server-status-small";

export function LatestServersList() {
  const {
    data: { servers },
  } = useLatestServers();

  if (!servers.length) {
    return <EmptyServers />;
  }

  return (
    <div className="divide-y">
      {servers.map((server) => (
        <div
          className="flex items-center justify-between gap-2 py-4 first:pt-0 last:pb-0"
          key={server.id}
        >
          <div className="flex flex-col space-y-0.5">
            <div className="flex items-center space-x-1.5">
              <NextLink
                href={paths.app.servers.overview.getHref(server.id)}
                className="truncate font-medium text-sm outline-none transition-all duration-300 hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                prefetch={false}
              >
                {server.name}
              </NextLink>
              {server.template && typeof server.template === "object" && (
                <OperatingSystemIcon
                  icon={server.template.icon}
                  className="size-3"
                />
              )}
            </div>
            <ServerStatusSmall server={server} />
          </div>
          <NextLink
            href={paths.app.servers.overview.getHref(server.id)}
            className="shrink-0 outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            prefetch={false}
          >
            <LucideChevronRight
              aria-hidden="true"
              className="text-muted-foreground transition-colors hover:text-foreground"
            />
          </NextLink>
        </div>
      ))}
    </div>
  );
}
