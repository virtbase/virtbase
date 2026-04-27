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

import { useSuspenseQuery } from "@tanstack/react-query";
import { DataTable, DataTableToolbar } from "@virtbase/ui/data-table";
import { useDataTable } from "@virtbase/ui/hooks";
import type { ListInvoicesInput } from "@virtbase/validators";
import { useInvoicesTableColumns } from "@/features/invoices/components/invoices-table/columns";
import { useTRPC } from "@/lib/trpc/react";

interface InvoicesTableProps {
  search: ListInvoicesInput;
}

export function InvoicesTable({ search }: InvoicesTableProps) {
  const trpc = useTRPC();

  const {
    data: { invoices, meta },
  } = useSuspenseQuery(trpc.invoices.list.queryOptions(search));

  const columns = useInvoicesTableColumns();

  const { table } = useDataTable({
    data: invoices,
    columns,
    pageCount: Math.ceil(
      meta.pagination.total_entries / meta.pagination.per_page,
    ),
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
    initialState: {
      sorting: [{ id: "id", desc: true }],
      columnPinning: { right: ["actions"] },
    },
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
