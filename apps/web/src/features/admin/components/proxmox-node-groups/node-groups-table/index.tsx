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
import type { getNodeGroupsList } from "@/features/admin/api/proxmox-node-groups/get-node-groups-list";
import type { NodeGroupsTableColumn } from "./columns";
import { useNodeGroupsTableColumns } from "./columns";

interface NodeGroupsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getNodeGroupsList>>]>;
}

type NodeGroupsTableRowAction = DataTableRowAction<
  NodeGroupsTableColumn,
  "delete"
>;

export function NodeGroupsTable({ promises }: NodeGroupsTableProps) {
  const [nodeGroups] = use(promises);
  const { data, pageCount } = nodeGroups;

  const [rowAction, setRowAction] =
    React.useState<NodeGroupsTableRowAction | null>(null);

  const columns = useNodeGroupsTableColumns({ setRowAction });

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
    initialState: {
      sorting: [{ id: "name", desc: false }],
      columnPinning: { right: ["actions"] },
    },
  });

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      {rowAction?.variant === "delete" && "Delete Node Group placeholder"}
    </>
  );
}
