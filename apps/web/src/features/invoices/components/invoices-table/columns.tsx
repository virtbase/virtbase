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
import { Button } from "@virtbase/ui/button";
import { Checkbox } from "@virtbase/ui/checkbox";

import { DataTableColumnHeader } from "@virtbase/ui/data-table";
import {
  CalendarIcon,
  EuroIcon,
  FileText,
  LucideDownload,
} from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import type { ListInvoicesOutput } from "@virtbase/validators";
import { useExtracted, useFormatter } from "next-intl";
import { useDownloadInvoice } from "@/features/dashboard/hooks/use-download-invoice";

type ListInvoice = ListInvoicesOutput["invoices"][number];

export function useInvoicesTableColumns(): Array<ColumnDef<ListInvoice>> {
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
      id: "number",
      accessorKey: "number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Invoice number")} />
      ),
      cell: ({ cell }) => (
        <div className="max-w-40 truncate font-medium">
          {cell.getValue<string>()}
        </div>
      ),
      meta: {
        label: t("Invoice number"),
        placeholder: t("Search invoice number..."),
        variant: "text",
        icon: FileText,
      },
      enableColumnFilter: true,
    },
    {
      id: "total",
      accessorKey: "total",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Amount")} />
      ),
      cell: ({ cell }) => {
        return formatter.number(cell.getValue<number>() / 100, {
          style: "currency",
          currency: "EUR",
        });
      },
      meta: {
        label: t("Amount"),
        variant: "number",
        icon: EuroIcon,
        unit: "€",
      },
      enableColumnFilter: true,
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Invoice date")} />
      ),
      cell: ({ cell }) => {
        return formatter.dateTime(cell.getValue<Date>());
      },
      meta: {
        label: t("Invoice date"),
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: false,
    },
    {
      id: "paid_at",
      accessorKey: "paid_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Paid at")} />
      ),
      cell: ({ cell }) => {
        const value = cell.getValue<Date | null>();

        if (!value) return "-";
        return formatter.dateTime(value);
      },
      meta: {
        label: t("Paid at"),
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: false,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const { mutate: downloadInvoice, isPending: isDownloadingInvoice } =
          useDownloadInvoice();

        return (
          <Button
            variant="ghost"
            className="flex size-8 p-0 data-[state=open]:bg-muted"
            aria-label={t("Download")}
            onClick={() => downloadInvoice({ id: row.original.id })}
            disabled={isDownloadingInvoice}
          >
            {isDownloadingInvoice ? (
              <Spinner />
            ) : (
              <LucideDownload aria-hidden="true" />
            )}
          </Button>
        );
      },
      size: 40,
    },
  ];
}
