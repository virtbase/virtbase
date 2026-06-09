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

import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@virtbase/ui/button";
import { Checkbox } from "@virtbase/ui/checkbox";

import { DataTableColumnHeader } from "@virtbase/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import { CalendarIcon, Ellipsis, LucideEye, Text } from "@virtbase/ui/icons";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { useExtracted, useFormatter } from "next-intl";
import type React from "react";
import type { getEmailsList } from "@/features/admin/api/emails/get-emails-list";

export type EmailsTableColumn = Awaited<
  ReturnType<typeof getEmailsList>
>["data"][number];

export function useEmailsTableColumns({
  setRowAction,
}: {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<EmailsTableColumn, "view"> | null>
  >;
}): Array<ColumnDef<EmailsTableColumn>> {
  const t = useExtracted();
  const formatter = useFormatter();

  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label={t("Select all")}
          className="translate-y-0.5"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={t("Select row")}
          className="translate-y-0.5"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: "subject",
      accessorKey: "subject",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Subject")} />
      ),
      cell: ({ cell }) => (
        <button
          type="button"
          className="max-w-40 truncate font-medium"
          onClick={() => setRowAction({ row: cell.row, variant: "view" })}
        >
          {cell.getValue<string>()}
        </button>
      ),
      meta: {
        label: t("Subject"),
        placeholder: t("Search by subject..."),
        variant: "text",
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      id: "lastEvent",
      accessorKey: "lastEvent",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Status")} />
      ),
      cell: ({ cell }) => {
        return <span>{cell.getValue<string>()}</span>;
      },
      meta: {
        label: t("Status"),
        variant: "text",
      },
    },
    {
      id: "from",
      accessorKey: "from",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("From")} />
      ),
      cell: ({ cell }) => {
        return <span>{cell.getValue<string>()}</span>;
      },
      meta: {
        label: t("From"),
        variant: "text",
      },
    },
    {
      id: "to",
      accessorKey: "to",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("To")} />
      ),
      cell: ({ cell }) => {
        return <span>{cell.getValue<string[]>().join(", ")}</span>;
      },
      meta: {
        label: t("To"),
        variant: "text",
      },
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Created at")} />
      ),
      cell: ({ cell }) => {
        return formatter.dateTime(cell.getValue<Date>(), {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      },
      meta: {
        label: t("Created at"),
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: true,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("Open menu")}
                variant="ghost"
                className="flex size-8 p-0 data-[state=open]:bg-muted"
              >
                <Ellipsis className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, variant: "view" })}
              >
                <LucideEye aria-hidden="true" />
                <span>{t("View")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 40,
    },
  ];
}
