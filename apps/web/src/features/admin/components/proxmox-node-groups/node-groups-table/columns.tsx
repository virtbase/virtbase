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
import {
  CalendarIcon,
  Ellipsis,
  LucideEye,
  LucideTrash2,
  Text,
} from "@virtbase/ui/icons";
import type { DataTableRowAction } from "@virtbase/ui/types";
import NextLink from "next/link";
import { useFormatter } from "next-intl";
import type React from "react";
import type { getNodeGroupsList } from "@/features/admin/api/proxmox-node-groups/get-node-groups-list";
import { paths } from "@/lib/paths";

export type NodeGroupsTableColumn = Awaited<
  ReturnType<typeof getNodeGroupsList>
>["data"][number];

export function getNodeGroupsTableColumns({
  setRowAction,
}: {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<
      NodeGroupsTableColumn,
      "delete"
    > | null>
  >;
}): Array<ColumnDef<NodeGroupsTableColumn>> {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all"
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
          aria-label="Select row"
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
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Name" />
      ),
      cell: ({ cell }) => (
        <NextLink
          className="max-w-40 truncate font-medium"
          href={paths.admin.nodeGroups.overview.getHref(cell.row.original.id)}
          prefetch={false}
        >
          {cell.getValue<string>()}
        </NextLink>
      ),
      meta: {
        label: "Name",
        placeholder: "Search by name...",
        variant: "text",
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Created at" />
      ),
      cell: ({ cell }) => {
        const formatter = useFormatter();

        return formatter.dateTime(cell.getValue<Date>());
      },
      meta: {
        label: "Created at",
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: true,
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Last updated" />
      ),
      cell: ({ cell }) => {
        const formatter = useFormatter();

        return formatter.dateTime(cell.getValue<Date>());
      },
      meta: {
        label: "Last updated",
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
                aria-label="Open menu"
                variant="ghost"
                className="flex size-8 p-0 data-[state=open]:bg-muted"
              >
                <Ellipsis className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem asChild>
                <NextLink
                  href={paths.admin.nodeGroups.overview.getHref(
                    row.original.id,
                  )}
                  prefetch={false}
                >
                  <LucideEye aria-hidden="true" />
                  <span>View</span>
                </NextLink>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setRowAction({ row, variant: "delete" })}
              >
                <LucideTrash2 aria-hidden="true" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 40,
    },
  ];
}
