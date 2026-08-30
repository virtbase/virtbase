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
import type { getTemplatesList } from "@/features/admin/api/proxmox-templates/get-templates-list";
import type { TemplatesTableColumn } from "./columns";
import { useTemplatesTableColumns } from "./columns";

const DeleteTemplateDialog = dynamic(
  () => import("../delete-template-dialog"),
  { ssr: false },
);

interface TemplatesTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getTemplatesList>>]>;
}

type TemplatesTableRowAction = DataTableRowAction<
  TemplatesTableColumn,
  "delete"
>;

export function TemplatesTable({ promises }: TemplatesTableProps) {
  const [templates] = use(promises);
  const { data, pageCount } = templates;

  const [rowAction, setRowAction] =
    React.useState<TemplatesTableRowAction | null>(null);

  const columns = useTemplatesTableColumns({ setRowAction });

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
    initialState: {
      sorting: [{ id: "name", desc: false }],
      columnPinning: { start: [], end: ["actions"] },
    },
  });

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      {rowAction?.variant === "delete" && (
        <DeleteTemplateDialog
          open
          onOpenChange={() => setRowAction(null)}
          template={rowAction.row.original}
        />
      )}
    </>
  );
}
