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
import React, { use } from "react";
import type { getProxmoxNodesList } from "@/features/admin/api/proxmox-nodes/get-proxmox-nodes-list";
import type { NodesTableColumn } from "./columns";
import { useNodesTableColumns } from "./columns";

interface NodesTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getProxmoxNodesList>>]>;
}

type NodesTableRowAction = DataTableRowAction<NodesTableColumn, "delete">;

export function NodesTable({ promises }: NodesTableProps) {
  const [nodes] = use(promises);
  const { data, pageCount } = nodes;

  const [rowAction, setRowAction] = React.useState<NodesTableRowAction | null>(
    null,
  );

  const columns = useNodesTableColumns({ setRowAction });

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
    initialState: {
      sorting: [{ id: "hostname", desc: false }],
      columnPinning: { right: ["actions"] },
    },
  });

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      {/** TODO: Add delete action */}
      {rowAction?.variant === "delete" && "Delete Node Group placeholder"}
    </>
  );
}
