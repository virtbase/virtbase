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
  LucideExternalLink,
  LucideEye,
  LucideHash,
  LucideTag,
  LucideText,
  LucideTrash2,
} from "@virtbase/ui/icons/index";
import type { DataTableRowAction } from "@virtbase/ui/types";
import NextLink from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import type { getServerTemplateCounts } from "@/features/admin/api/servers/get-server-template-counts";
import type { getServersList } from "@/features/admin/api/servers/get-servers-list";
import { paths } from "@/lib/paths";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import { UserAvatar } from "@/ui/user-avatar";

export type ServersTableColumn = Awaited<
  ReturnType<typeof getServersList>
>["data"][number];

export function useServersTableColumns({
  setRowAction,
  templateCounts,
}: {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<
      ServersTableColumn,
      "delete"
    > | null>
  >;
  templateCounts: Awaited<ReturnType<typeof getServerTemplateCounts>>;
}): Array<ColumnDef<ServersTableColumn>> {
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
      cell: ({ cell }) => (
        <span className="line-clamp-1 max-w-40 truncate font-medium">
          {cell.getValue<string>()}
        </span>
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
      id: "vmid",
      accessorKey: "vmid",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("VM ID")} />
      ),
      cell: ({ cell }) => {
        return cell.getValue<number>();
      },
      meta: {
        label: t("VM ID"),
        variant: "number",
        icon: LucideHash,
      },
      enableColumnFilter: true,
    },
    {
      id: "template",
      accessorKey: "template.name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Template")} />
      ),
      cell: ({ row }) => {
        const template = row.original.template;

        if (!template) {
          return null;
        }

        return (
          <NextLink
            href={paths.admin.templates.overview.getHref(template.id)}
            prefetch={false}
            className="flex items-center gap-1.5"
          >
            <OperatingSystemIcon icon={template.icon} />
            <span className="line-clamp-1 max-w-40 truncate">
              {template.name}
            </span>
          </NextLink>
        );
      },
      meta: {
        label: t("Template"),
        variant: "multiSelect",
        options: Object.entries(templateCounts).map(([id, template]) => ({
          label: template.name,
          value: id,
          count: template.count,
          // Provide a function component returning the icon, to fit Option type requirements
          icon: (props) => (
            <OperatingSystemIcon
              className="size-4"
              icon={template.icon}
              {...props}
            />
          ),
        })),
        icon: LucideTag,
      },
      enableColumnFilter: true,
    },
    {
      id: "user",
      accessorKey: "user.name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("User")} />
      ),
      cell: ({ row }) => {
        const user = row.original.user;
        return (
          <NextLink
            href={paths.admin.users.overview.getHref(user.id)}
            prefetch={false}
            className="flex items-center gap-1.5"
          >
            <UserAvatar className="size-5" user={user} />
            <span>{user.name}</span>
          </NextLink>
        );
      },
      meta: {
        label: t("User"),
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
    {
      id: "terminatesAt",
      accessorKey: "terminatesAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Terminates at")} />
      ),
      cell: ({ cell }) => {
        const value = cell.getValue<Date | null>();
        return value ? format.dateTime(value) : null;
      },
      meta: {
        label: t("Terminates at"),
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
              <DropdownMenuItem asChild>
                <a
                  href={`https://${row.original.proxmoxNode.fqdn}/#v1:0:=qemu%2F${row.original.vmid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <LucideExternalLink aria-hidden="true" />
                  <span>{t("View in Proxmox")}</span>
                </a>
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
