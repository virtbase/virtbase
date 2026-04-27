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
  getUserRoleCounts,
  getUsersList,
  getUserVerifiedCounts,
} from "@/features/admin/api/users/get-users-list";
import type { UsersTableColumn } from "@/features/admin/components/users/users-table/columns";
import { useUsersTableColumns } from "./columns";

interface UsersTableProps {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getUsersList>>,
      Awaited<ReturnType<typeof getUserRoleCounts>>,
      Awaited<ReturnType<typeof getUserVerifiedCounts>>,
    ]
  >;
}

type UsersTableRowAction = DataTableRowAction<UsersTableColumn, "delete">;

export function UsersTable({ promises }: UsersTableProps) {
  const [users, roleCounts, verifiedCounts] = use(promises);
  const { data, pageCount } = users;

  const [rowAction, setRowAction] = React.useState<UsersTableRowAction | null>(
    null,
  );

  const columns = useUsersTableColumns({
    setRowAction,
    roleCounts,
    verifiedCounts,
  });

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
      {rowAction?.variant === "delete" && "Delete User placeholder"}
    </>
  );
}
