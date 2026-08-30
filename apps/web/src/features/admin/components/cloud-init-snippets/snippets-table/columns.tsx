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
  LucidePencil,
  LucideText,
  LucideTrash2,
} from "@virtbase/ui/icons/index";
import { Tooltip, TooltipContent, TooltipTrigger } from "@virtbase/ui/tooltip";
import type { ColumnDef, DataTableRowAction } from "@virtbase/ui/types";
import NextLink from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import type { getSnippetsList } from "@/features/admin/api/cloud-init-snippets/get-snippets-list";
import { paths } from "@/lib/paths";

export type SnippetsTableColumn = Awaited<
  ReturnType<typeof getSnippetsList>
>["data"][number];

export function useSnippetsTableColumns({
  setRowAction,
}: {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<
      SnippetsTableColumn,
      "delete"
    > | null>
  >;
}): Array<ColumnDef<SnippetsTableColumn>> {
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
      id: "priority",
      accessorKey: "priority",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Order")} />
      ),
      cell: ({ cell }) => (
        <span className="text-muted-foreground text-sm tabular-nums">
          {cell.getValue<number>()}
        </span>
      ),
      meta: { label: t("Order") },
      size: 60,
    },
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Name")} />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <NextLink
            className="max-w-40 truncate font-medium"
            href={paths.admin.snippets.overview.getHref(row.original.id)}
            prefetch={false}
          >
            {row.original.name}
          </NextLink>
          {!row.original.enabled && (
            <Badge variant="outline">{t("Disabled")}</Badge>
          )}
          {row.original.scope === "optional" && (
            <Badge variant="outline">{t("Optional")}</Badge>
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
      id: "slug",
      accessorKey: "slug",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Slug")} />
      ),
      cell: ({ cell }) => (
        <span className="text-muted-foreground text-sm">
          {cell.getValue<string>()}
        </span>
      ),
      meta: { label: t("Slug") },
    },
    {
      id: "kind",
      accessorKey: "kind",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Kind")} />
      ),
      cell: ({ cell }) => {
        const kind = cell.getValue<string>();

        return (
          <Badge variant={kind === "shell" ? "secondary" : "outline"}>
            {kind}
          </Badge>
        );
      },
      meta: { label: t("Kind") },
    },
    {
      id: "targets",
      accessorKey: "targets",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Applies to")} />
      ),
      cell: ({ row }) => {
        const targets = row.original.targets ?? {};
        const dimensions = [
          ...(targets.osFamily ?? []),
          ...(targets.packageManager ?? []),
          ...(targets.initSystem ?? []),
          ...(targets.architecture ?? []),
          ...(targets.osVersionRange ? [targets.osVersionRange] : []),
        ];

        return dimensions.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            {t("every template")}
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {dimensions.map((value) => (
              <Badge key={value} variant="outline">
                {value}
              </Badge>
            ))}
          </div>
        );
      },
      meta: { label: t("Applies to") },
      enableSorting: false,
    },
    {
      id: "matchCount",
      accessorKey: "matchCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Templates")} />
      ),
      cell: ({ row }) => (
        // A selector mistake reads as a count that went to zero.
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="tabular-nums">
              <span
                className={
                  row.original.matchCount === 0 ? "text-destructive" : undefined
                }
              >
                {row.original.matchCount}
              </span>
              <span className="text-muted-foreground">
                {" / "}
                {row.original.templateCount}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t("Templates this snippet currently applies to")}
          </TooltipContent>
        </Tooltip>
      ),
      meta: { label: t("Templates") },
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
                href={paths.admin.snippets.overview.getHref(row.original.id)}
                prefetch={false}
              >
                <LucidePencil aria-hidden="true" />
                <span>{t("Edit")}</span>
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
