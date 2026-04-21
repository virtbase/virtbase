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

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@virtbase/ui/badge";
import { DataTableColumnHeader } from "@virtbase/ui/data-table";
import {
  LucideLoaderCircle,
  LucideLock,
  LucideLockOpen,
  LucideX,
} from "@virtbase/ui/icons";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { formatBytes } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted, useFormatter, useNow } from "next-intl";
import type React from "react";
import { useEffect } from "react";
import type { GetBackupListOutput } from "@/features/servers/hooks/backups/use-backup-list";
import { useBackupStatus } from "@/features/servers/hooks/backups/use-backup-status";
import { useTRPC } from "@/lib/trpc/react";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import { BackupActions } from "./backup-actions";

export type BackupsTableColumn = GetBackupListOutput["backups"][number];

export function useBackupsTableColumns({
  rowAction,
  setRowAction,
}: {
  rowAction: DataTableRowAction<BackupsTableColumn, "restore"> | null;
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<
      BackupsTableColumn,
      "restore"
    > | null>
  >;
}): Array<ColumnDef<BackupsTableColumn>> {
  const t = useExtracted();
  const format = useFormatter();

  return [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Name")} />
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
          label={t("Timestamp")}
        />
      ),
      cell: ({ cell }) => {
        const now = useNow({ updateInterval: 1000 });

        return (
          <div className="w-[160px] text-muted-foreground max-md:hidden">
            {format.relativeTime(cell.getValue<Date>(), { now })}
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
          label={t("Size/Status")}
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
                  {t("Failed")}
                </Badge>
              )
            ) : (
              <Badge variant="outline">
                <LucideLoaderCircle
                  className="animate-spin"
                  aria-hidden="true"
                />
                {t("Creating...")}{" "}
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
          label={t("Operating System")}
          className="max-md:hidden"
        />
      ),
      cell: ({ row }) => {
        let template = row.original.template;
        if (typeof template === "string") {
          // Fallback to displaying unknown template if not expanded
          template = null;
        }

        return (
          <div className="flex w-[160px] items-center gap-2 text-muted-foreground max-md:hidden">
            <OperatingSystemIcon icon={template?.icon} />
            <span className="truncate">{template?.name ?? t("Unknown")}</span>
          </div>
        );
      },
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <BackupActions
          row={row}
          rowAction={rowAction}
          setRowAction={setRowAction}
        />
      ),
      size: 40,
    },
  ];
}
