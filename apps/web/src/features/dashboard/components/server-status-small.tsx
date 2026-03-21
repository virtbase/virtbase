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

import { cn } from "@virtbase/ui";
import {
  LucideBan,
  LucideCheck,
  LucideClock,
  LucideLoader,
  LucideTriangleAlert,
} from "@virtbase/ui/icons";
import {
  getEstimatedServerDeletionDate,
  isExpiring,
  isInstalling,
  isSuspended,
  isTerminated,
} from "@virtbase/utils";
import { useExtracted, useFormatter, useNow } from "next-intl";
import type { GetLatestServersOutput } from "../hooks/use-latest-servers";

type Server = GetLatestServersOutput["servers"][number];

type ServerStatusSmallProps = Pick<
  Server,
  "installed_at" | "suspended_at" | "terminates_at"
>;

export function ServerStatusSmall({
  server,
}: {
  server: ServerStatusSmallProps;
}) {
  const t = useExtracted();

  const formatter = useFormatter();
  const now = useNow({ updateInterval: 1000 });

  // [!] Order is important, the first state that matches is used
  const states = [
    {
      icon: LucideBan,
      className: "text-destructive",
      condition: isTerminated,
      label: (server: ServerStatusSmallProps) =>
        t("Expired (will be deleted {date})", {
          date: formatter.relativeTime(
            getEstimatedServerDeletionDate(server) as Date,
            now,
          ),
        }),
    },
    {
      icon: LucideTriangleAlert,
      className: "text-yellow-500",
      condition: isSuspended,
      label: () => t("Suspended"),
    },
    {
      icon: LucideLoader,
      className: "text-yellow-500 [&_svg]:animate-spin",
      condition: isInstalling,
      label: () => t("Installing..."),
    },
    {
      icon: LucideClock,
      className: "text-yellow-500",
      condition: isExpiring,
      label: (server: ServerStatusSmallProps) =>
        t("Expiring (will be deleted {date})", {
          date: formatter.relativeTime(
            getEstimatedServerDeletionDate(server) as Date,
            now,
          ),
        }),
    },
    {
      icon: LucideCheck,
      className: "text-green-500",
      condition: () => true,
      label: () => t("Operational"),
    },
  ] as const;

  const state = states.find((state) => state.condition(server));

  if (!state) {
    // Should never happen, since the last state is always true
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 truncate font-light text-xs",
        state.className,
      )}
    >
      <state.icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{state.label(server)}</span>
    </div>
  );
}
