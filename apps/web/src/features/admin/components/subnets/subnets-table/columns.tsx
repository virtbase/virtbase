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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  CalendarIcon,
  Ellipsis,
  LucideCornerDownRight,
  LucideEye,
  LucideTrash2,
  Network,
  Tag,
  Text,
} from "@virtbase/ui/icons";
import type { DataTableRowAction } from "@virtbase/ui/types";
import NextLink from "next/link";
import { useFormatter } from "next-intl";
import type React from "react";
import type {
  getSubnetsList,
  getSubnetTypeCounts,
  getSubnetVlanCounts,
} from "@/features/admin/api/subnets/get-subnets-list";
import { paths } from "@/lib/paths";

export type SubnetsTableColumn = Awaited<
  ReturnType<typeof getSubnetsList>
>["data"][number];

export function getSubnetsTableColumns({
  setRowAction,
  vlanCounts,
  typeCounts,
}: {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<
      SubnetsTableColumn,
      "delete"
    > | null>
  >;
  vlanCounts: Awaited<ReturnType<typeof getSubnetVlanCounts>>;
  typeCounts: Awaited<ReturnType<typeof getSubnetTypeCounts>>;
}): Array<ColumnDef<SubnetsTableColumn>> {
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
      id: "cidr",
      accessorKey: "cidr",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="CIDR" />
      ),
      cell: ({ cell }) => (
        <NextLink
          className="flex items-center gap-1 truncate"
          href={paths.admin.subnets.overview.getHref(cell.row.original.id)}
          prefetch={false}
        >
          {cell.row.original.parentId && (
            <LucideCornerDownRight
              className="size-3 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span className="max-w-40 truncate font-medium">
            {cell.getValue<string>()}
          </span>
        </NextLink>
      ),
      meta: {
        label: "CIDR",
        placeholder: "Search by CIDR...",
        variant: "text",
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      id: "family",
      accessorKey: "family",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Type" />
      ),
      cell: ({ cell }) => (
        <div className="flex items-center gap-2">
          <div className="max-w-40 truncate font-medium">
            {cell.getValue<number>() === 4 ? "IPv4" : "IPv6"}
          </div>
        </div>
      ),
      meta: {
        label: "Type",
        variant: "multiSelect",
        options: Object.entries(typeCounts).map(([type, count]) => ({
          label: `IPv${type}`,
          value: type,
          count,
          //icon: Tag,
        })),
        icon: Network,
      },
      enableColumnFilter: true,
    },
    {
      id: "vlan",
      accessorKey: "vlan",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="VLAN ID" />
      ),
      cell: ({ cell }) => (
        <div className="flex items-center gap-2">
          <div className="max-w-40 truncate font-medium">
            {cell.getValue<number>()}
          </div>
        </div>
      ),
      meta: {
        label: "VLAN ID",
        variant: "multiSelect",
        options: Object.entries(vlanCounts).map(([vlan, count]) => ({
          label: vlan,
          value: vlan,
          count,
          //icon: Tag,
        })),
        icon: Tag,
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
                  href={paths.admin.subnets.overview.getHref(row.original.id)}
                  prefetch={false}
                >
                  <LucideEye aria-hidden="true" />
                  <span>View</span>
                </NextLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
