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
import { Avatar, AvatarFallback, AvatarImage } from "@virtbase/ui/avatar";
import { Badge } from "@virtbase/ui/badge";
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
  CircleCheck,
  CircleDashed,
  CircleX,
  Ellipsis,
  LucideBan,
  LucideExternalLink,
  LucideEye,
  LucideLogIn,
  LucideTrash2,
  LucideUnlock,
  Mail,
  Text,
} from "@virtbase/ui/icons";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { APP_DOMAIN } from "@virtbase/utils";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useExtracted, useFormatter } from "next-intl";
import type React from "react";
import { toast } from "sonner";
import type {
  getUserRoleCounts,
  getUsersList,
  getUserVerifiedCounts,
} from "@/features/admin/api/users/get-users-list";
import { getRoleIcon, getRoleLabel } from "@/features/admin/lib/users/labels";
import { authClient } from "@/lib/auth/client";
import { paths } from "@/lib/paths";

export type UsersTableColumn = Awaited<
  ReturnType<typeof getUsersList>
>["data"][number];

export function useUsersTableColumns({
  setRowAction,
  roleCounts,
  verifiedCounts,
}: {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<UsersTableColumn, "delete"> | null>
  >;
  roleCounts: Awaited<ReturnType<typeof getUserRoleCounts>>;
  verifiedCounts: Awaited<ReturnType<typeof getUserVerifiedCounts>>;
}): Array<ColumnDef<UsersTableColumn>> {
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
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Name")} />
      ),
      cell: ({ cell, row }) => (
        <div className="flex items-center gap-2">
          <Avatar className="in-data-[state=expanded]:size-6 transition-[width,height] duration-200 ease-in-out">
            <AvatarImage src={row.original.image || undefined} />
            <AvatarFallback>{row.original.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <NextLink
            href={paths.admin.users.overview.getHref(row.original.id)}
            prefetch={false}
            className="max-w-40 truncate font-medium"
          >
            {cell.getValue<string>()}
          </NextLink>
        </div>
      ),
      meta: {
        label: t("Name"),
        placeholder: t("Name/Email"),
        variant: "text",
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      id: "email",
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Email")} />
      ),
      cell: ({ cell }) => (
        <div className="max-w-40 truncate">{cell.getValue<string>()}</div>
      ),
      enableColumnFilter: true,
      meta: {
        label: t("Email"),
        icon: Mail,
      },
    },
    {
      id: "role",
      accessorKey: "role",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Role")} />
      ),
      cell: ({ cell }) => {
        const role = cell.getValue<"CUSTOMER" | "ADMIN">();

        const Icon = getRoleIcon(role);

        return (
          <Badge variant="outline" className="py-1 [&>svg]:size-3.5">
            <Icon />
            <span className="capitalize">{getRoleLabel(role)}</span>
          </Badge>
        );
      },
      meta: {
        label: t("Role"),
        variant: "multiSelect",
        options: (Object.keys(roleCounts) as Array<"CUSTOMER" | "ADMIN">).map(
          (role) => ({
            label: getRoleLabel(role),
            value: role,
            count: roleCounts[role],
            icon: getRoleIcon(role),
          }),
        ),
        icon: CircleDashed,
      },
      enableColumnFilter: true,
    },
    {
      id: "emailVerified",
      accessorKey: "emailVerified",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Email verified")} />
      ),
      cell: ({ cell }) => {
        const isVerified = cell.getValue<boolean>();

        return (
          <Badge variant="outline">
            {isVerified ? (
              <CircleCheck aria-hidden="true" />
            ) : (
              <CircleX aria-hidden="true" />
            )}
            <span>{isVerified ? t("Yes") : t("No")}</span>
          </Badge>
        );
      },
      meta: {
        label: t("Email verified"),
        variant: "select",
        options: [
          {
            label: "Yes",
            value: "true",
            icon: CircleCheck,
            count: verifiedCounts.true,
          },
          {
            label: "No",
            value: "false",
            icon: CircleX,
            count: verifiedCounts.false,
          },
        ],
        icon: CircleCheck,
      },
      enableColumnFilter: true,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Created at")} />
      ),
      cell: ({ cell }) => {
        return formatter.dateTime(cell.getValue<Date>());
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
        const router = useRouter();
        const user = row.original;

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
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <NextLink
                  href={paths.admin.users.overview.getHref(user.id)}
                  prefetch={false}
                >
                  <LucideEye aria-hidden="true" />
                  <span>{t("View")}</span>
                </NextLink>
              </DropdownMenuItem>
              {!user.banned && (
                <DropdownMenuItem
                  onSelect={() =>
                    authClient.admin.impersonateUser({
                      userId: user.id,
                      fetchOptions: {
                        onSuccess: () => {
                          router.push(APP_DOMAIN);
                        },
                      },
                    })
                  }
                  disabled={user.banned}
                >
                  <LucideLogIn aria-hidden="true" />
                  <span>{t("Impersonate")}</span>
                </DropdownMenuItem>
              )}
              {user.stripeCustomerId && (
                <DropdownMenuItem asChild>
                  <a
                    href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <LucideExternalLink aria-hidden="true" />
                    <span>{t("View in Stripe")}</span>
                  </a>
                </DropdownMenuItem>
              )}

              {user.banned && (
                <DropdownMenuItem
                  onSelect={() => {
                    authClient.admin.unbanUser({
                      userId: user.id,
                      fetchOptions: {
                        onSuccess: () => {
                          toast.success(`${user.name} has been unbanned.`);

                          router.refresh();
                        },
                      },
                    });
                  }}
                  disabled={!user.banned}
                >
                  <LucideUnlock aria-hidden="true" />
                  <span>{t("Unlock")}</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />

              {!user.banned && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    authClient.admin.banUser({
                      userId: user.id,
                      fetchOptions: {
                        onSuccess: () => {
                          toast.success(`${user.name} has been banned.`);

                          router.refresh();
                        },
                      },
                    });
                  }}
                  disabled={user.banned}
                >
                  <LucideBan aria-hidden="true" />
                  <span>{t("Ban")}</span>
                </DropdownMenuItem>
              )}

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
