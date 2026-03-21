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

import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { ClientOnly } from "@virtbase/ui/client-only";
import { LucideBan, LucideLoader, LucideServerOff } from "@virtbase/ui/icons";
import {
  getEstimatedServerDeletionDate,
  isExpiring,
  isInstalling,
  isSuspended,
} from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { useServer } from "../hooks/use-server";

export function ServerStatusBar() {
  const t = useExtracted();
  const now = useNow({ updateInterval: 1000 });
  const formatter = useFormatter();

  const { id: serverId } = useParams<{ id: string }>();
  const { data: { server } = {}, isPending } = useServer({
    server_id: serverId,
  });

  if (!server || isPending) {
    return null;
  }

  // [!] Order is important, the first state that matches is used
  const states = [
    {
      icon: LucideServerOff,
      variant: "destructive",
      title: t("Server suspended"),
      description: t(
        "This server has been suspended and will be deleted at {date}, if not renewed.",
        {
          date: formatter.relativeTime(
            getEstimatedServerDeletionDate(server) as Date,
            now,
          ),
        },
      ),
      condition: isSuspended,
    },
    {
      icon: LucideBan,
      variant: "warning",
      title: t("Server is expiring"),
      description: t(
        "This server is expiring {expiry} and will be deleted after, if not renewed",
        {
          expiry: formatter.relativeTime(server.terminates_at as Date, now),
        },
      ),
      condition: isExpiring,
    },
    {
      icon: LucideLoader,
      iconClassName: "animate-spin",
      variant: "warning",
      title: t("Server is installing"),
      description: t(
        "This server is being installed. Some features may not be available yet.",
      ),
      condition: isInstalling,
    },
  ];

  const state = states.find((state) => state.condition(server));
  if (!state) {
    return null;
  }

  return (
    <ClientOnly>
      <Alert variant="warning">
        <state.icon className={state.iconClassName} />
        <AlertTitle>{state.title}</AlertTitle>
        <AlertDescription>{state.description}</AlertDescription>
      </Alert>
    </ClientOnly>
  );
}
