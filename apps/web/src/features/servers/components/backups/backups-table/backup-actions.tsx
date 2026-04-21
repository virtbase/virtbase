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

import type { Row } from "@tanstack/react-table";
import { cn } from "@virtbase/ui";
import { Button } from "@virtbase/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  LucideArchiveRestore,
  LucideLock,
  LucideLockOpen,
  LucideMoreVertical,
  LucideTrash2,
} from "@virtbase/ui/icons";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { isBusy, isOperational } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import type React from "react";
import { useDeleteBackup } from "@/features/servers/hooks/backups/use-delete-backup";
import { useUpdateBackup } from "@/features/servers/hooks/backups/use-update-backup";
import { useServerStatus } from "@/features/servers/hooks/use-server-status";
import type { BackupsTableColumn } from "./columns";

interface BackupActionsProps extends React.ComponentProps<"div"> {
  row: Row<BackupsTableColumn>;
  rowAction: DataTableRowAction<BackupsTableColumn, "restore"> | null;
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<
      BackupsTableColumn,
      "restore"
    > | null>
  >;
}

export function BackupActions({
  row,
  rowAction,
  setRowAction,
  className,
  ...props
}: BackupActionsProps) {
  const t = useExtracted();
  const { id: serverId } = useParams<{ id: string }>();

  const { data: { status } = {}, isPending: isServerStatusPending } =
    useServerStatus({
      server_id: serverId,
    });

  const { mutate: updateBackup, isPending: isUpdatePending } =
    useUpdateBackup();

  const { mutate: deleteBackup, isPending: isDeletePending } =
    useDeleteBackup();

  const isActionsDisabled =
    isServerStatusPending ||
    !status ||
    !isOperational(status) ||
    isBusy(status) ||
    isUpdatePending ||
    isDeletePending ||
    rowAction !== null;

  const {
    id: backupId,
    finished_at: finishedAt,
    failed_at: failedAt,
    is_locked: isLocked,
  } = row.original;

  return (
    <div
      className={cn("flex items-center gap-2 justify-self-end", className)}
      {...props}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-8 text-muted-foreground"
            disabled={isActionsDisabled}
          >
            <LucideMoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!finishedAt || !!failedAt || isActionsDisabled}
            onSelect={() =>
              setRowAction({
                row,
                variant: "restore",
              })
            }
          >
            <LucideArchiveRestore aria-hidden="true" />
            <span>{t("Restore")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!finishedAt || isActionsDisabled}
            onClick={() =>
              updateBackup({
                server_id: serverId,
                backup_id: backupId,
                is_locked: !isLocked,
              })
            }
          >
            {!isLocked ? (
              <>
                <LucideLock aria-hidden="true" />
                <span>{t("Lock")}</span>
              </>
            ) : (
              <>
                <LucideLockOpen aria-hidden="true" />
                <span>{t("Unlock")}</span>
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={isLocked || !finishedAt || isActionsDisabled}
            onSelect={() =>
              deleteBackup({ server_id: serverId, backup_id: backupId })
            }
          >
            <LucideTrash2 aria-hidden="true" />
            <span>{t("Delete")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
