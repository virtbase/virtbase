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
import type { DataTableRowAction } from "@virtbase/ui/types";
import dynamic from "next/dynamic";
import React, { use } from "react";
import type { getSnippetsList } from "@/features/admin/api/cloud-init-snippets/get-snippets-list";
import type { SnippetsTableColumn } from "./columns";
import { useSnippetsTableColumns } from "./columns";

const DeleteSnippetDialog = dynamic(() => import("../delete-snippet-dialog"), {
  ssr: false,
});

interface SnippetsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getSnippetsList>>]>;
}

type SnippetsTableRowAction = DataTableRowAction<SnippetsTableColumn, "delete">;

export function SnippetsTable({ promises }: SnippetsTableProps) {
  const [snippets] = use(promises);
  const { data, pageCount } = snippets;

  const [rowAction, setRowAction] =
    React.useState<SnippetsTableRowAction | null>(null);

  const columns = useSnippetsTableColumns({ setRowAction });

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
    initialState: {
      sorting: [{ id: "priority", desc: false }],
      columnPinning: { right: ["actions"] },
    },
  });

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      {rowAction?.variant === "delete" && (
        <DeleteSnippetDialog
          open
          onOpenChange={() => setRowAction(null)}
          snippet={rowAction.row.original}
        />
      )}
    </>
  );
}
