/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { dataTableFeatures } from "@virtbase/ui/lib";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { useState } from "react";
import type { BackupsTableColumn } from "../../components/backups/backups-table/columns.tsx";
import { useBackupsTableColumns } from "../../components/backups/backups-table/columns.tsx";

export function useBackupsTable({ data }: { data: BackupsTableColumn[] }) {
  const [rowAction, setRowAction] = useState<DataTableRowAction<
    BackupsTableColumn,
    "restore" | "delete"
  > | null>(null);
  const columns = useBackupsTableColumns({
    rowAction,
    setRowAction,
  });

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    state: {
      sorting,
      columnFilters,
    },
    enableHiding: false,
    initialState: {
      sorting: [{ id: "id", desc: true }],
      columnPinning: { start: [], end: ["actions"] },
    },
  });

  return { table, rowAction, setRowAction };
}
