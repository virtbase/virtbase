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

import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import { Checkbox } from "@virtbase/ui/checkbox";
import { DataTableColumnHeader } from "@virtbase/ui/data-table/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  CalendarIcon,
  LucideEllipsis,
  LucideEye,
  LucideText,
  LucideTrash2,
} from "@virtbase/ui/icons/index";
import { Tooltip, TooltipContent, TooltipTrigger } from "@virtbase/ui/tooltip";
import type { ColumnDef, DataTableRowAction } from "@virtbase/ui/types";
import NextLink from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import type { getTemplatesList } from "@/features/admin/api/proxmox-templates/get-templates-list";
import { paths } from "@/lib/paths";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";

export type TemplatesTableColumn = Awaited<
  ReturnType<typeof getTemplatesList>
>["data"][number];

export function useTemplatesTableColumns({
  setRowAction,
}: {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<
      TemplatesTableColumn,
      "delete"
    > | null>
  >;
}): Array<ColumnDef<TemplatesTableColumn>> {
  const t = useExtracted();
  const format = useFormatter();

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
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Name")} />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <OperatingSystemIcon icon={row.original.icon} />
          <NextLink
            className="max-w-40 truncate font-medium"
            href={paths.admin.templates.overview.getHref(row.original.id)}
            prefetch={false}
          >
            {row.original.name}
          </NextLink>
          {!row.original.enabled && (
            <Badge variant="outline">{t("Disabled")}</Badge>
          )}
        </div>
      ),
      meta: {
        label: t("Name"),
        placeholder: t("Search by name..."),
        variant: "text",
        icon: LucideText,
      },
      enableColumnFilter: true,
    },
    {
      id: "groupName",
      accessorKey: "groupName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Group")} />
      ),
      cell: ({ cell }) => (
        <span className="text-muted-foreground">
          {cell.getValue<string | null>() ?? "-"}
        </span>
      ),
      meta: { label: t("Group") },
      enableSorting: false,
    },
    {
      id: "guest",
      accessorKey: "osFamily",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Guest")} />
      ),
      cell: ({ row }) => {
        const parts = [
          row.original.osFamily,
          row.original.osVersion,
          row.original.architecture,
        ].filter(Boolean);

        return parts.length === 0 ? (
          <span className="text-muted-foreground text-xs">{t("unset")}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {parts.map((part) => (
              <Badge key={String(part)} variant="outline">
                {part}
              </Badge>
            ))}
          </div>
        );
      },
      meta: { label: t("Guest") },
      enableSorting: false,
    },
    {
      id: "readyNodes",
      accessorKey: "readyNodes",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Image")} />
      ),
      cell: ({ row }) => {
        const ready = row.original.readyNodes ?? 0;
        const total = row.original.totalNodes ?? 0;
        const failed = row.original.failedNodes ?? 0;
        const label = `${ready}/${total}`;

        // The number that decides whether customers can pick this template:
        // it is only offered when every node has the image settled.
        if (failed > 0) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive">{label}</Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-md break-all">
                {row.original.lastError ?? t("A download failed.")}
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Badge
            variant={total > 0 && ready === total ? "default" : "secondary"}
          >
            {label}
          </Badge>
        );
      },
      meta: { label: t("Image") },
      enableSorting: false,
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Updated at")} />
      ),
      cell: ({ cell }) =>
        format.dateTime(cell.getValue<Date>(), {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      meta: {
        label: t("Updated at"),
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: true,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("Open menu")}
              variant="ghost"
              className="flex size-8 p-0 data-[state=open]:bg-muted"
            >
              <LucideEllipsis className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem asChild>
              <NextLink
                href={paths.admin.templates.overview.getHref(row.original.id)}
                prefetch={false}
              >
                <LucideEye aria-hidden="true" />
                <span>{t("View")}</span>
              </NextLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setRowAction({ row, variant: "delete" })}
            >
              <LucideTrash2 aria-hidden="true" />
              <span>{t("Delete")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      size: 40,
    },
  ];
}
