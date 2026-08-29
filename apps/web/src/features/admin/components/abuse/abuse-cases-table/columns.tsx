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
import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import { Checkbox } from "@virtbase/ui/checkbox";
import { DataTableColumnHeader } from "@virtbase/ui/data-table/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  CalendarIcon,
  Ellipsis,
  LucideBan,
  LucideCircleCheck,
  LucideCircleDot,
  LucideExternalLink,
  LucideEye,
  LucideShieldAlert,
  LucideSignal,
  LucideText,
  LucideTriangleAlert,
} from "@virtbase/ui/icons/index";
import NextLink from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import type { getAbuseCasesList } from "@/features/admin/api/abuse/get-abuse-cases-list";
import { setAbuseCaseStatusAction } from "@/features/admin/api/abuse/manage-abuse-cases";
import {
  ALL_CASE_STATUSES,
  CASE_CATEGORIES,
  CASE_SEVERITIES,
} from "@/features/admin/lib/abuse/validations";
import { paths } from "@/lib/paths";
import {
  CATEGORY_ICONS,
  humanise,
  SEVERITY_ICONS,
  STATUS_ICONS,
} from "@/ui/abuse/case-meta";
import { UserAvatar } from "@/ui/user-avatar";

export type AbuseCasesTableColumn = Awaited<
  ReturnType<typeof getAbuseCasesList>
>["data"][number];

/** Statuses an operator moves a case to from the row menu. */
const MOVABLE_STATUSES = [
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
] as const;

/** A settled case is settled; reopening one is not a status change. */
const TERMINAL: string[] = ["resolved", "rejected"];

function RowActions({ row }: { row: AbuseCasesTableColumn }) {
  const t = useExtracted();

  const settled = TERMINAL.includes(row.status);

  const move = (status: (typeof MOVABLE_STATUSES)[number]) =>
    setAbuseCaseStatusAction({ caseId: row.id, status });

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
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <NextLink
            href={paths.admin.abuseCase.getHref(row.id)}
            prefetch={false}
          >
            <LucideEye aria-hidden="true" />
            <span>{t("View case")}</span>
          </NextLink>
        </DropdownMenuItem>

        {row.user ? (
          <DropdownMenuItem asChild>
            <NextLink
              href={paths.admin.users.overview.getHref(row.user.id)}
              prefetch={false}
            >
              <LucideExternalLink aria-hidden="true" />
              <span>{t("View customer")}</span>
            </NextLink>
          </DropdownMenuItem>
        ) : null}

        {settled ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LucideCircleDot aria-hidden="true" />
                <span>{t("Move to")}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <DropdownMenuLabel>{t("Status")}</DropdownMenuLabel>
                {MOVABLE_STATUSES.filter((status) => status !== row.status).map(
                  (status) => {
                    const Icon = STATUS_ICONS[status];

                    return (
                      <DropdownMenuItem
                        key={status}
                        onSelect={() => void move(status)}
                      >
                        <Icon />
                        <span>{humanise(status)}</span>
                      </DropdownMenuItem>
                    );
                  },
                )}
                <DropdownMenuSeparator />
                {/* Closing needs a reason, and the row is the wrong place to
                    ask for one. The case page has the submenus that pair the
                    ending with why. */}
                <DropdownMenuItem asChild>
                  <NextLink
                    href={paths.admin.abuseCase.getHref(row.id)}
                    prefetch={false}
                  >
                    <LucideCircleCheck aria-hidden="true" />
                    <span>{t("Close on the case…")}</span>
                  </NextLink>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        {settled ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <LucideBan aria-hidden="true" />
              <span>{t("Closed as {reason}", { reason: "—" })}</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useAbuseCasesTableColumns({
  statusCounts,
}: {
  statusCounts: Record<string, number>;
}): Array<ColumnDef<AbuseCasesTableColumn>> {
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
      id: "reference",
      accessorKey: "reference",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Case")} />
      ),
      cell: ({ row }) => (
        <NextLink
          href={paths.admin.abuseCase.getHref(row.original.id)}
          prefetch={false}
          className="flex items-center gap-1.5 font-medium tabular-nums"
        >
          {row.original.reference}
          <LucideExternalLink aria-hidden="true" className="size-3.5" />
        </NextLink>
      ),
      meta: { label: t("Case") },
      enableSorting: false,
      enableHiding: false,
      size: 110,
    },
    {
      id: "title",
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Report")} />
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="line-clamp-1 max-w-80 truncate">
            {row.original.title}
          </span>
          {row.original.staleAttribution ? (
            <Badge variant="destructive" className="shrink-0">
              {t("Stale")}
            </Badge>
          ) : null}
        </div>
      ),
      meta: {
        label: t("Report"),
        // One box for the three things an operator arrives with: a reference
        // from an email, a phrase from a report, or the customer's address.
        placeholder: t("Search by case, title or customer..."),
        variant: "text",
        icon: LucideText,
      },
      enableColumnFilter: true,
      enableSorting: false,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Status")} />
      ),
      cell: ({ row }) => {
        const { status, overdue } = row.original;
        const Icon = STATUS_ICONS[status];

        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              <Icon aria-hidden="true" />
              {humanise(status)}
            </Badge>
            {overdue ? (
              <Badge variant="destructive">{t("Overdue")}</Badge>
            ) : null}
          </div>
        );
      },
      meta: {
        label: t("Status"),
        variant: "multiSelect",
        options: ALL_CASE_STATUSES.map((value) => ({
          label: humanise(value),
          value,
          count: statusCounts[value] ?? 0,
          icon: STATUS_ICONS[value],
        })),
        icon: LucideCircleDot,
      },
      enableColumnFilter: true,
      enableSorting: false,
    },
    {
      id: "severity",
      accessorKey: "severity",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Severity")} />
      ),
      cell: ({ row }) => {
        const Icon = SEVERITY_ICONS[row.original.severity];

        return (
          <Badge variant="outline">
            <Icon aria-hidden="true" />
            {row.original.severity}
          </Badge>
        );
      },
      meta: {
        label: t("Severity"),
        variant: "multiSelect",
        options: CASE_SEVERITIES.map((value) => ({
          label: value,
          value,
          icon: SEVERITY_ICONS[value],
        })),
        icon: LucideTriangleAlert,
      },
      enableColumnFilter: true,
      enableSorting: false,
    },
    {
      id: "category",
      accessorKey: "category",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Category")} />
      ),
      cell: ({ row }) => {
        const Icon = CATEGORY_ICONS[row.original.category];

        return (
          <Badge variant="outline">
            <Icon aria-hidden="true" />
            {humanise(row.original.category)}
          </Badge>
        );
      },
      meta: {
        label: t("Category"),
        variant: "multiSelect",
        options: CASE_CATEGORIES.map((value) => ({
          label: humanise(value),
          value,
          icon: CATEGORY_ICONS[value],
        })),
        icon: LucideShieldAlert,
      },
      enableColumnFilter: true,
      enableSorting: false,
    },
    {
      id: "customer",
      accessorFn: (row) => row.user?.email ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Customer")} />
      ),
      cell: ({ row }) => {
        const user = row.original.user;

        // A case that arrived by email belongs to nobody until somebody reads
        // it. Saying so is more useful than an empty cell.
        if (!user) {
          return (
            <span className="text-muted-foreground">
              {t("Not yet attributed")}
            </span>
          );
        }

        return (
          <NextLink
            href={paths.admin.users.overview.getHref(user.id)}
            prefetch={false}
            className="flex items-center gap-2"
          >
            <UserAvatar user={user} className="size-6" />
            <span className="line-clamp-1 max-w-48 truncate">{user.email}</span>
          </NextLink>
        );
      },
      meta: { label: t("Customer") },
      enableSorting: false,
    },
    {
      id: "enforcement",
      accessorKey: "enforcement",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Enforcement")} />
      ),
      cell: ({ row }) => {
        const { enforcement, blocksOrdering, serverCount } = row.original;

        return (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {"none" === enforcement
                ? t("{count} servers", { count: String(serverCount) })
                : humanise(enforcement)}
            </span>
            {blocksOrdering ? (
              <Badge variant="outline">{t("No orders")}</Badge>
            ) : null}
          </div>
        );
      },
      meta: { label: t("Enforcement"), icon: LucideSignal },
      enableSorting: false,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Opened")} />
      ),
      cell: ({ cell }) => (
        <span className="whitespace-nowrap" suppressHydrationWarning>
          {format.dateTime(cell.getValue<Date>(), {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
      ),
      meta: {
        label: t("Opened"),
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: true,
    },
    {
      id: "actions",
      cell: ({ row }) => <RowActions row={row.original} />,
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
  ];
}
