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

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideBan,
  LucideDatabaseBackup,
  LucidePowerOff,
  LucideSettings,
} from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import {
  hasState,
  hasTask,
  isInstalling,
  isSuspended,
  isTerminated,
  ProxmoxServerStatus,
  ProxmoxTaskStatus,
} from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useServerConsole } from "../../hooks/console/use-console";

export function ConsoleFrame() {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();
  const {
    serverStatus,
    data: url,
    isPending,
    isError,
    isServerStatusPending,
    isServerStatusError,
  } = useServerConsole({
    server_id: serverId,
  });

  if (isServerStatusPending || isServerStatusError || !serverStatus) {
    return <Skeleton className="size-full" />;
  }

  if (isInstalling(serverStatus)) {
    return (
      <Empty className="size-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideSettings aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("Server is installing")}</EmptyTitle>
          <EmptyDescription>
            {t("This feature is not available while the server is installing.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isSuspended(serverStatus) || isTerminated(serverStatus)) {
    return (
      <Empty className="size-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideBan aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("Server is suspended")}</EmptyTitle>
          <EmptyDescription>
            {t(
              "This feature is not available while the server is suspended. Please renew your server to access the console.",
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (
    hasTask(serverStatus, ProxmoxTaskStatus.BACKING_UP) ||
    hasTask(serverStatus, ProxmoxTaskStatus.RESTORING_BACKUP)
  ) {
    return (
      <Empty className="size-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideDatabaseBackup aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("Backup in progress")}</EmptyTitle>
          <EmptyDescription>
            {t(
              "This feature is not available while a backup is in progress. Please try again later.",
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!hasState(serverStatus, ProxmoxServerStatus.RUNNING)) {
    return (
      <Empty className="size-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucidePowerOff aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("Server is not running")}</EmptyTitle>
          <EmptyDescription>
            {t("Start your server and the console will connect automatically.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!url || isPending || isError) {
    return <Skeleton className="size-full" />;
  }

  return (
    <iframe src={url} title="noVNC" className="size-full" allowFullScreen />
  );
}
