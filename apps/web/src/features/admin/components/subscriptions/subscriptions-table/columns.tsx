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

import { Badge } from "@virtbase/ui/badge";
import { DataTableColumnHeader } from "@virtbase/ui/data-table/data-table-column-header";
import {
  CalendarIcon,
  LucideCircleDot,
  LucideExternalLink,
  LucideFileSignature,
  LucideRefreshCw,
  LucideText,
} from "@virtbase/ui/icons/index";
import type { ColumnDef } from "@virtbase/ui/types";
import NextLink from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import type { getSubscriptionsList } from "@/features/admin/api/subscriptions/get-subscriptions-list";
import { SUBSCRIPTION_STATUSES } from "@/features/admin/lib/subscriptions/validations";
import { paths } from "@/lib/paths";
import { UserAvatar } from "@/ui/user-avatar";
import {
  humaniseSubscriptionTerm,
  SUBSCRIPTION_STATUS_ICONS,
} from "../subscription-meta";

export type SubscriptionsTableColumn = Awaited<
  ReturnType<typeof getSubscriptionsList>
>["data"][number];

export function useSubscriptionsTableColumns({
  statusCounts,
}: {
  statusCounts: Record<string, number>;
}): Array<ColumnDef<SubscriptionsTableColumn>> {
  const t = useExtracted();
  const format = useFormatter();

  return [
    {
      id: "q",
      accessorFn: (row) => row.subjectName ?? row.subjectId,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Subject")} />
      ),
      cell: ({ row }) => (
        <NextLink
          href={paths.admin.subscription.getHref(row.original.id)}
          prefetch={false}
          className="flex min-w-0 items-center gap-1.5 font-medium"
        >
          {/* A subscription outlives its subject, so there may be no name
              left. The raw id is still what an operator matches against a
              ticket, so it stands in rather than an empty cell. */}
          <span className="line-clamp-1 max-w-56 truncate">
            {row.original.subjectName ?? row.original.subjectId}
          </span>
          <LucideExternalLink
            aria-hidden="true"
            className="size-3.5 shrink-0"
          />
        </NextLink>
      ),
      meta: {
        label: t("Subject"),
        // One box for the three things support arrives with: a subscription or
        // server id pasted out of a ticket, the customer's address, or the
        // name of the machine they are asking about.
        placeholder: t("Search by server, customer or id..."),
        variant: "text",
        icon: LucideText,
      },
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "customer",
      accessorFn: (row) => row.user.email,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Customer")} />
      ),
      cell: ({ row }) => (
        <NextLink
          href={paths.admin.users.overview.getHref(row.original.user.id)}
          prefetch={false}
          className="flex items-center gap-2"
        >
          <UserAvatar user={row.original.user} className="size-6" />
          <span className="line-clamp-1 max-w-48 truncate">
            {row.original.user.email}
          </span>
        </NextLink>
      ),
      meta: { label: t("Customer") },
      enableSorting: false,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Status")} />
      ),
      cell: ({ row }) => {
        const Icon = SUBSCRIPTION_STATUS_ICONS[row.original.status];

        return (
          <Badge
            variant={
              "past_due" === row.original.status ||
              "suspended" === row.original.status
                ? "destructive"
                : "outline"
            }
          >
            <Icon aria-hidden="true" />
            {humaniseSubscriptionTerm(row.original.status)}
          </Badge>
        );
      },
      meta: {
        label: t("Status"),
        variant: "multiSelect",
        options: SUBSCRIPTION_STATUSES.map((value) => ({
          label: humaniseSubscriptionTerm(value),
          value,
          count: statusCounts[value] ?? 0,
          icon: SUBSCRIPTION_STATUS_ICONS[value],
        })),
        icon: LucideCircleDot,
      },
      enableColumnFilter: true,
    },
    {
      id: "currentPeriodEnd",
      accessorKey: "currentPeriodEnd",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Period ends")} />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col whitespace-nowrap">
          <span suppressHydrationWarning>
            {format.dateTime(row.original.currentPeriodEnd, {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
          <span className="text-muted-foreground text-xs">
            {t("every {months} months", {
              months: String(row.original.intervalMonths),
            })}
          </span>
        </div>
      ),
      meta: {
        label: t("Period ends"),
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: true,
    },
    {
      id: "autoRenew",
      accessorKey: "autoRenew",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Auto-renew")} />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.autoRenew ? "outline" : "secondary"}>
          {row.original.autoRenew ? t("On") : t("Off")}
        </Badge>
      ),
      meta: {
        label: t("Auto-renew"),
        variant: "select",
        options: [
          { label: t("On"), value: "true" },
          { label: t("Off"), value: "false" },
        ],
        icon: LucideRefreshCw,
      },
      enableColumnFilter: true,
      enableSorting: false,
    },
    {
      id: "mandate",
      accessorKey: "mandateRecorded",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Mandate")} />
      ),
      cell: ({ row }) => {
        // Renewal turned on with no consent on file is the one combination
        // here that is a defect rather than a customer's choice, so it is the
        // only one that shouts.
        const missingButNeeded =
          row.original.autoRenew && !row.original.mandateRecorded;

        return (
          <Badge
            variant={
              missingButNeeded
                ? "destructive"
                : row.original.mandateRecorded
                  ? "outline"
                  : "secondary"
            }
          >
            {row.original.mandateRecorded ? t("Recorded") : t("None")}
          </Badge>
        );
      },
      meta: {
        label: t("Mandate"),
        variant: "select",
        options: [
          { label: t("Recorded"), value: "true" },
          { label: t("None"), value: "false" },
        ],
        icon: LucideFileSignature,
      },
      enableColumnFilter: true,
      enableSorting: false,
    },
  ];
}
