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
import { LucideDisc3 } from "@virtbase/ui/icons";
import { useExtracted, useFormatter, useNow } from "next-intl";
import type { GetServerOutput } from "../hooks/use-server";

export function ServerMountsBadge({
  mounts,
}: {
  mounts: GetServerOutput["server"]["mounts"];
}) {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 1000 });

  if (mounts.length === 0) {
    return null;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge variant="warning">
          <LucideDisc3 aria-hidden="true" />
          {t("Mounted")}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="center">
        {mounts.map((mount) => {
          if (typeof mount === "string") {
            return null;
          }

          return (
            <div
              key={mount.id}
              className="grid grid-cols-2 gap-2 overflow-hidden text-sm"
            >
              <span className="truncate font-medium">{mount.image.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {t("Expires {time}", {
                  time: format.relativeTime(mount.image.expires_at, now),
                })}
              </span>
            </div>
          );
        })}
      </HoverCardContent>
    </HoverCard>
  );
}
