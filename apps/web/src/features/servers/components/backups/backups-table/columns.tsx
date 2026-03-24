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

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import { DataTableColumnHeader } from "@virtbase/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  LucideArchiveRestore,
  LucideLoaderCircle,
  LucideLock,
  LucideLockOpen,
  LucideMoreVertical,
  LucideTrash2,
  LucideX,
} from "@virtbase/ui/icons";
import { formatBytes } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useFormatter, useNow } from "next-intl";
import { useEffect, useState } from "react";
import type { GetBackupListOutput } from "@/features/servers/hooks/backups/use-backup-list";
import { useBackupStatus } from "@/features/servers/hooks/backups/use-backup-status";
import { useDeleteBackup } from "@/features/servers/hooks/backups/use-delete-backup";
import { useUpdateBackup } from "@/features/servers/hooks/backups/use-update-backup";
import { useTRPC } from "@/lib/trpc/react";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";

export type BackupsTableColumn = GetBackupListOutput["backups"][number];

export function getBackupsTableColumns(): Array<ColumnDef<BackupsTableColumn>> {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Name" />
      ),
      cell: ({ row }) => {
        const { name, is_locked: isLocked } = row.original;

        return (
          <div className="flex w-full min-w-0 items-center gap-2 md:max-w-[180px] lg:max-w-[500px] [&>svg]:size-4 [&>svg]:shrink-0">
            {isLocked ? (
              <LucideLock className="text-green-500" aria-hidden="true" />
            ) : (
              <LucideLockOpen className="text-destructive" aria-hidden="true" />
            )}
            <span className="truncate font-medium">{name}</span>
          </div>
        );
      },
    },
    {
      id: "started_at",
      accessorKey: "started_at",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="max-md:hidden"
          column={column}
          label="Timestamp"
        />
      ),
      cell: ({ row }) => {
        const { started_at } = row.original;
        const format = useFormatter();
        const now = useNow({ updateInterval: 1000 });

        return (
          <div className="w-[160px] text-muted-foreground max-md:hidden">
            {format.relativeTime(started_at, { now })}
          </div>
        );
      },
    },
    {
      id: "size",
      accessorKey: "size",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="max-md:hidden"
          column={column}
          label="Size/Status"
        />
      ),
      cell: ({ row }) => {
        const queryClient = useQueryClient();
        const trpc = useTRPC();

        const { id: serverId } = useParams<{ id: string }>();

        // TODO: Fix loading state
        const { data: { status } = {} } = useBackupStatus({
          backup_id: row.original.id,
          server_id: serverId,
          queryConfig: {
            enabled:
              !row.original.finished_at &&
              row.original.id !== "kbu_0000000000000000000000000",
            refetchInterval: 5_000,
          },
        });

        useEffect(() => {
          if (!row.original.finished_at && status?.finished_at) {
            void queryClient.invalidateQueries(
              trpc.servers.backups.list.queryFilter({
                server_id: serverId,
              }),
            );
          }
        }, [
          status?.finished_at,
          row.original.finished_at,
          queryClient,
          serverId,
          trpc,
        ]);

        const format = useFormatter();

        return (
          <div className="w-[160px] text-muted-foreground max-md:hidden">
            {row.original.finished_at ? (
              !row.original.failed_at ? (
                formatBytes(row.original.size as number, {
                  formatter: format,
                })
              ) : (
                <Badge variant="destructive">
                  <LucideX aria-hidden />
                  Failed
                </Badge>
              )
            ) : (
              <Badge variant="outline">
                <LucideLoaderCircle
                  className="animate-spin"
                  aria-hidden="true"
                />
                Creating...{" "}
                {status?.percentage
                  ? `(${format.number(status.percentage / 100, { style: "percent" })})`
                  : null}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "template",
      accessorKey: "template",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          label="Operating System"
          className="max-md:hidden"
        />
      ),
      cell: ({ row }) => {
        const { template } = row.original;

        if (typeof template === "string") {
          return null;
        }

        return (
          <div className="flex w-[160px] items-center gap-2 text-muted-foreground max-md:hidden">
            <OperatingSystemIcon icon={template?.icon} />
            <span className="truncate">{template?.name ?? "Unknown"}</span>
          </div>
        );
      },
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const {
          id: backupId,
          finished_at: finishedAt,
          failed_at: failedAt,
        } = row.original;
        const { id: serverId } = useParams<{ id: string }>();

        const [rowAction, setRowAction] = useState<"restore" | null>(null);

        const { mutate: updateBackup, isPending: isUpdatingBackup } =
          useUpdateBackup();

        const { mutate: deleteBackup, isPending: isDeletingBackup } =
          useDeleteBackup();

        const isLocked = row.original.is_locked;

        return (
          <div className="flex items-center gap-2 justify-self-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8">
                  <LucideMoreVertical aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!finishedAt || !!failedAt || isDeletingBackup}
                  onSelect={() => setRowAction("restore")}
                >
                  <LucideArchiveRestore aria-hidden />
                  Restore
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!finishedAt || isUpdatingBackup || isDeletingBackup}
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
                      <LucideLock aria-hidden />
                      Lock
                    </>
                  ) : (
                    <>
                      <LucideLockOpen aria-hidden />
                      Unlock
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isLocked || !finishedAt || isDeletingBackup}
                  onSelect={() =>
                    deleteBackup({ server_id: serverId, backup_id: backupId })
                  }
                >
                  <LucideTrash2 aria-hidden />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* TODO: {rowAction === "restore" && (
              <RestoreBackupDialog
                backup={row.original}
                open={rowAction === "restore"}
                onOpenChange={() => setRowAction(null)}
              /> */}
          </div>
        );
      },
    },
  ];
}
