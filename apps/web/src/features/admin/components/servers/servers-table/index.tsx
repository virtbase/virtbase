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
import type { getServerTemplateCounts } from "@/features/admin/api/servers/get-server-template-counts";
import type { getServersList } from "@/features/admin/api/servers/get-servers-list";
import type { ServersTableColumn } from "./columns";
import { useServersTableColumns } from "./columns";

interface ServersTableProps {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getServersList>>,
      Awaited<ReturnType<typeof getServerTemplateCounts>>,
    ]
  >;
}

type ServersTableRowAction = DataTableRowAction<ServersTableColumn, "delete">;

export function ServersTable({ promises }: ServersTableProps) {
  const [servers, templateCounts] = use(promises);
  const { data, pageCount } = servers;

  const [rowAction, setRowAction] =
    React.useState<ServersTableRowAction | null>(null);

  const columns = useServersTableColumns({ setRowAction, templateCounts });

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
      {/** TODO: Add delete action */}
      {rowAction?.variant === "delete" && "Delete Server placeholder"}
    </>
  );
}
