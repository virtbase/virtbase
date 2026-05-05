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
  Ellipsis,
  LucideEye,
  LucideText,
  LucideTrash2,
} from "@virtbase/ui/icons/index";
import { Progress } from "@virtbase/ui/progress";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { formatBits, formatBytes } from "@virtbase/utils";
import NextLink from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import type { getProxmoxNodesList } from "@/features/admin/api/proxmox-nodes/get-proxmox-nodes-list";
import { paths } from "@/lib/paths";

export type NodesTableColumn = Awaited<
  ReturnType<typeof getProxmoxNodesList>
>["data"][number];

export function useNodesTableColumns({
  setRowAction,
}: {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<NodesTableColumn, "delete"> | null>
  >;
}): Array<ColumnDef<NodesTableColumn>> {
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
      id: "hostname",
      accessorKey: "hostname",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Hostname")} />
      ),
      cell: ({ cell }) => (
        <NextLink
          className="max-w-40 truncate font-medium"
          href={paths.admin.nodes.overview.getHref(cell.row.original.id)}
          prefetch={false}
        >
          {cell.getValue<string>()}
        </NextLink>
      ),
      meta: {
        label: t("Hostname"),
        placeholder: t("Search by hostname..."),
        variant: "text",
        icon: LucideText,
      },
      enableColumnFilter: true,
    },
    // custom fields
    {
      id: "guestCount",
      accessorKey: "guestCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Number of VMs")} />
      ),
      cell: ({ cell }) => {
        const count = cell.getValue<number>();
        const limit = cell.row.original.guestLimit;

        const format = useFormatter();

        if (limit) {
          return (
            <div className="flex max-w-40 flex-col items-center gap-2">
              <Progress
                value={Math.min((count / limit) * 100, 100)}
                max={100}
              />
              <span className="text-muted-foreground text-xs">
                {t("{usage} / {limit}", {
                  usage: format.number(count),
                  limit: format.number(limit),
                })}
              </span>
            </div>
          );
        }

        return <span>{t("{usage} / ∞", { usage: format.number(count) })}</span>;
      },
      enableColumnFilter: true,
      meta: {
        label: "Anzahl der VMs",
      },
    },
    {
      id: "memoryUsage",
      accessorKey: "memoryUsage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("RAM")} />
      ),
      cell: ({ cell }) => {
        const usage = cell.getValue<number>();
        const limit = cell.row.original.memoryLimit;

        if (limit) {
          return (
            <div className="flex max-w-40 flex-col items-center gap-2">
              <Progress
                value={Math.min((usage / limit) * 100, 100)}
                max={100}
              />
              <span className="text-muted-foreground text-xs">
                {t("{usage} / {limit}", {
                  usage: formatBytes(usage * 1024 * 1024, {
                    formatter: format,
                  }),
                  limit: formatBytes(limit * 1024 * 1024, {
                    formatter: format,
                  }),
                })}
              </span>
            </div>
          );
        }

        return (
          <span>
            {t("{usage} / ∞", {
              usage: formatBytes(usage * 1024 * 1024, { formatter: format }),
            })}
          </span>
        );
      },
      enableColumnFilter: true,
      meta: {
        label: t("RAM"),
      },
    },

    {
      id: "storageUsage",
      accessorKey: "storageUsage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Storage")} />
      ),
      cell: ({ cell }) => {
        const usage = cell.getValue<number>();
        const limit = cell.row.original.storageLimit;

        if (limit) {
          return (
            <div className="flex max-w-40 flex-col items-center gap-2">
              <Progress
                value={Math.min((usage / limit) * 100, 100)}
                max={100}
              />
              <span className="text-muted-foreground text-xs">
                {t("{usage} / {limit}", {
                  usage: formatBytes(usage * 1024 * 1024 * 1024, {
                    formatter: format,
                  }),
                  limit: formatBytes(limit * 1024 * 1024 * 1024, {
                    formatter: format,
                  }),
                })}
              </span>
            </div>
          );
        }

        return (
          <span>
            {t("{usage} / ∞", {
              usage: formatBytes(usage * 1024 * 1024 * 1024, {
                formatter: format,
              }),
            })}
          </span>
        );
      },
      enableColumnFilter: true,
      meta: {
        label: t("Storage"),
      },
    },
    {
      id: "coresUsage",
      accessorKey: "coresUsage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("vCores")} />
      ),
      cell: ({ cell }) => {
        const usage = cell.getValue<number>();
        const limit = cell.row.original.coresLimit;

        if (limit) {
          return (
            <div className="flex max-w-40 flex-col items-center gap-2">
              <Progress
                value={Math.min((usage / limit) * 100, 100)}
                max={100}
              />
              <span className="text-muted-foreground text-xs">
                {t("{usage} / {limit}", {
                  usage: format.number(usage),
                  limit: format.number(limit),
                })}
              </span>
            </div>
          );
        }

        return <span>{t("{usage} / ∞", { usage: format.number(usage) })}</span>;
      },
      enableColumnFilter: true,
      meta: {
        label: t("vCores"),
      },
    },
    {
      id: "netrateUsage",
      accessorKey: "netrateUsage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Bandwidth")} />
      ),
      cell: ({ cell }) => {
        const usage = cell.getValue<number>();
        const limit = cell.row.original.netrateLimit;

        if (limit) {
          return (
            <div className="flex max-w-40 flex-col items-center gap-2">
              <Progress
                value={Math.min((usage / limit) * 100, 100)}
                max={100}
              />
              <span className="text-muted-foreground text-xs">
                {t("{usage} / {limit}", {
                  usage: formatBits(usage * 1e6 * 8, {
                    formatter: format,
                    perSecond: true,
                    base: 1000,
                    unit: "gigabit",
                  }),
                  limit: formatBits(limit * 1e6 * 8, {
                    formatter: format,
                    perSecond: true,
                    base: 1000,
                    unit: "gigabit",
                  }),
                })}
              </span>
            </div>
          );
        }

        return (
          <span>
            {t("{usage} / ∞", {
              usage: formatBits(usage * 1e6 * 8, {
                formatter: format,
                perSecond: true,
                base: 1000,
                unit: "gigabit",
              }),
            })}
          </span>
        );
      },
      enableColumnFilter: true,
      meta: {
        label: t("Bandwidth"),
      },
    },
    // end of custom fields
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Created at")} />
      ),
      cell: ({ cell }) => {
        return format.dateTime(cell.getValue<Date>());
      },
      meta: {
        label: t("Created at"),
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: true,
    },
    // TODO: Implement more actions and refactor to own component
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
              <DropdownMenuItem asChild>
                <NextLink
                  href={paths.admin.nodes.overview.getHref(row.original.id)}
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
        );
      },
      size: 40,
    },
  ];
}
