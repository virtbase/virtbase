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

import { Button } from "@virtbase/ui/button";
import { ButtonGroup } from "@virtbase/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  LucideDownload,
  LucideMoreHorizontal,
  LucidePause,
  LucidePlay,
  LucidePower,
  LucidePowerOff,
  LucideRefreshCw,
  LucideSquareStop,
  LucideZap,
} from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import {
  hasState,
  isBusy,
  isInstalling,
  isSuspended,
  ProxmoxServerStatus,
} from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useServerStatus } from "../hooks/use-server-status";
import { useUpdateServerStatus } from "../hooks/use-update-server-status";

export function ServerActionsRow() {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();
  const { data: { status } = {}, isPending } = useServerStatus({
    server_id: serverId,
  });

  const { mutate: changeStatus } = useUpdateServerStatus();

  if (isPending || !status) {
    return <Skeleton className="h-9 w-32" />;
  }

  return (
    <ButtonGroup disabled={isSuspended(status) || isInstalling(status)}>
      {hasState(status, ProxmoxServerStatus.RUNNING) && (
        <>
          <Button
            variant="outline"
            onClick={() =>
              changeStatus({ server_id: serverId, action: "shutdown" })
            }
            disabled={isBusy(status)}
          >
            <LucidePowerOff className="text-muted-foreground" aria-hidden />
            {t("Shutdown")}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              changeStatus({ server_id: serverId, action: "reboot" })
            }
            disabled={isBusy(status)}
          >
            <LucideRefreshCw className="text-muted-foreground" aria-hidden />
            {t("Reboot")}
          </Button>
        </>
      )}
      {hasState(status, ProxmoxServerStatus.STOPPED) && (
        // VM is currently fully stopped without pending operation
        <Button
          variant="outline"
          onClick={() => changeStatus({ server_id: serverId, action: "start" })}
          disabled={isBusy(status)}
        >
          <LucidePower className="text-muted-foreground" aria-hidden />
          {t("Start")}
        </Button>
      )}
      {(hasState(status, ProxmoxServerStatus.PAUSED) ||
        hasState(status, ProxmoxServerStatus.SUSPENDED)) && (
        // VM is hibernated
        <Button
          variant="outline"
          onClick={() =>
            changeStatus({ server_id: serverId, action: "resume" })
          }
          disabled={isBusy(status)}
        >
          <LucidePlay className="text-muted-foreground" aria-hidden />
          {t("Resume")}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" disabled={isBusy(status)}>
            <LucideMoreHorizontal
              className="text-muted-foreground"
              aria-hidden
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              changeStatus({ server_id: serverId, action: "pause" })
            }
            disabled={
              !hasState(status, ProxmoxServerStatus.RUNNING) || isBusy(status)
            }
          >
            <LucidePause aria-hidden />
            {t("Pause")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              changeStatus({ server_id: serverId, action: "suspend" })
            }
            disabled={
              !hasState(status, ProxmoxServerStatus.RUNNING) || isBusy(status)
            }
          >
            <LucideDownload aria-hidden />
            {t("Suspend")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              changeStatus({ server_id: serverId, action: "stop" })
            }
            disabled={
              hasState(status, ProxmoxServerStatus.STOPPED) || isBusy(status)
            }
          >
            <LucideSquareStop aria-hidden />
            {t("Stop")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              changeStatus({ server_id: serverId, action: "reset" })
            }
            disabled={
              hasState(status, ProxmoxServerStatus.STOPPED) || isBusy(status)
            }
          >
            <LucideZap aria-hidden />
            {t("Reset")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
