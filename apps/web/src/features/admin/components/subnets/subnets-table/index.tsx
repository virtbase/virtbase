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
import type {
  getSubnetsList,
  getSubnetTypeCounts,
  getSubnetVlanCounts,
} from "@/features/admin/api/subnets/get-subnets-list";
import type { SubnetsTableColumn } from "@/features/admin/components/subnets/subnets-table/columns";
import { useSubnetsTableColumns } from "@/features/admin/components/subnets/subnets-table/columns";

interface SubnetsTableProps {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getSubnetsList>>,
      Awaited<ReturnType<typeof getSubnetVlanCounts>>,
      Awaited<ReturnType<typeof getSubnetTypeCounts>>,
    ]
  >;
}

type SubnetsTableRowAction = DataTableRowAction<SubnetsTableColumn, "delete">;

export function SubnetsTable({ promises }: SubnetsTableProps) {
  const [subnets, vlanCounts, typeCounts] = use(promises);
  const { data, pageCount } = subnets;

  const [rowAction, setRowAction] =
    React.useState<SubnetsTableRowAction | null>(null);

  const columns = useSubnetsTableColumns({
    setRowAction,
    vlanCounts,
    typeCounts,
  });

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
    initialState: {
      sorting: [{ id: "cidr", desc: false }],
      columnPinning: { right: ["actions"] },
    },
  });

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      {rowAction?.variant === "delete" && "Delete Subnet placeholder"}
    </>
  );
}
