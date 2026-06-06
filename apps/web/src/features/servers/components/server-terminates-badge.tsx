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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@virtbase/ui/hover-card";
import { LucideClock, LucideClockAlert } from "@virtbase/ui/icons";
import { isExpiring } from "@virtbase/utils";
import { useFormatter, useNow } from "next-intl";
import type React from "react";

interface ServerTerminatesBadgeProps
  extends Omit<React.ComponentProps<typeof Badge>, "children" | "variant"> {
  server: {
    terminates_at: Date | null;
  };
  hoverCardProps?: React.ComponentProps<typeof HoverCardContent>;
}

export function ServerTerminatesBadge({
  server,
  hoverCardProps,
  ...props
}: ServerTerminatesBadgeProps) {
  const formatter = useFormatter();
  const now = useNow({ updateInterval: 1000 });

  if (!server.terminates_at) {
    return null;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge
          variant={!isExpiring(server) ? "secondary" : "destructive"}
          {...props}
        >
          {!isExpiring(server) ? (
            <LucideClock aria-hidden="true" />
          ) : (
            <LucideClockAlert aria-hidden="true" />
          )}
          {formatter.relativeTime(server.terminates_at, {
            now,
          })}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="center" {...hoverCardProps}>
        <div className="flex flex-col truncate text-sm">
          <span className="truncate font-medium">
            {formatter.dateTime(server.terminates_at, {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })}
          </span>
          <span className="text-muted-foreground">
            {formatter.dateTime(server.terminates_at, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
              timeZone: "UTC",
            })}
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
