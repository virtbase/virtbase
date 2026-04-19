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

import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@virtbase/ui/button";
import { DataTableColumnHeader } from "@virtbase/ui/data-table/data-table-column-header";
import { LucideTrash2 } from "@virtbase/ui/icons/index";
import { useParams } from "next/navigation";
import { useExtracted, useFormatter } from "next-intl";
import { useDeletePointerRecord } from "@/features/servers/hooks/rdns/use-delete-pointer-record";
import type { GetPointerRecordsListOutput } from "@/features/servers/hooks/rdns/use-pointer-records-list";

export type RecordsTableColumn = GetPointerRecordsListOutput["records"][number];

export function useRecordsTableColumns(): Array<ColumnDef<RecordsTableColumn>> {
  const t = useExtracted();
  const formatter = useFormatter();

  return [
    {
      id: "ip",
      accessorKey: "ip",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("IP")} />
      ),
      cell: ({ cell }) => (
        <span className="font-medium">{cell.getValue<string>()}</span>
      ),
    },
    {
      id: "hostname",
      accessorKey: "hostname",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Hostname")} />
      ),
      cell: ({ cell }) => (
        <span className="text-muted-foreground">{cell.getValue<string>()}</span>
      ),
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Created at")} />
      ),
      cell: ({ cell }) => (
        <span className="text-muted-foreground">
          {formatter.dateTime(cell.getValue<Date>())}
        </span>
      ),
    },
    {
      id: "updated_at",
      accessorKey: "updated_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Updated at")} />
      ),
      cell: ({ cell }) => (
        <span className="text-muted-foreground">
          {formatter.dateTime(cell.getValue<Date>())}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const { id: serverId } = useParams<{ id: string }>();
        const { mutate, isPending } = useDeletePointerRecord();

        return (
          <Button
            variant="destructive"
            size="icon"
            className="h-8"
            onClick={() =>
              mutate({
                server_id: serverId,
                id: row.original.id,
              })
            }
            disabled={isPending}
            aria-label={t("Delete PTR record")}
          >
            <LucideTrash2 aria-hidden="true" />
          </Button>
        );
      },
      size: 40,
    },
  ];
}
