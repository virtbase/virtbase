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

import { DataTable, DataTableToolbar } from "@virtbase/ui/data-table";
import { useDataTable } from "@virtbase/ui/hooks";
import { use } from "react";
import type {
  getAbuseCaseStatusCounts,
  getAbuseCasesList,
} from "@/features/admin/api/abuse/get-abuse-cases-list";
import { useAbuseCasesTableColumns } from "./columns";

interface AbuseCasesTableProps {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getAbuseCasesList>>,
      Awaited<ReturnType<typeof getAbuseCaseStatusCounts>>,
    ]
  >;
}

export function AbuseCasesTable({ promises }: AbuseCasesTableProps) {
  const [cases, statusCounts] = use(promises);
  const { data, pageCount } = cases;

  const columns = useAbuseCasesTableColumns({ statusCounts });

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    // Deliberately off: the status filter defaults to the active statuses, and
    // clearing it back to the default would drop it from the URL and read as
    // "no filter" - which is the one state that hides nothing.
    clearOnDefault: false,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
    },
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
