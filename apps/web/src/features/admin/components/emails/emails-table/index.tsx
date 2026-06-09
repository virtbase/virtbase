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
import type { getEmailsList } from "@/features/admin/api/emails/get-emails-list";
import type { EmailsTableColumn } from "@/features/admin/components/emails/emails-table/columns";
import { useEmailsTableColumns } from "@/features/admin/components/emails/emails-table/columns";

const EmailPreviewDialog = dynamic(() => import("../email-preview-dialog"), {
  ssr: false,
});

interface EmailsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getEmailsList>>]>;
}

type EmailsTableRowAction = DataTableRowAction<EmailsTableColumn, "view">;

export function EmailsTable({ promises }: EmailsTableProps) {
  const [emails] = use(promises);
  const { data, pageCount } = emails;

  const [rowAction, setRowAction] = React.useState<EmailsTableRowAction | null>(
    null,
  );

  const columns = useEmailsTableColumns({ setRowAction });

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
  });

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      {rowAction?.variant === "view" && (
        <EmailPreviewDialog
          open={rowAction.variant === "view"}
          onOpenChange={(open) => setRowAction(open ? rowAction : null)}
          row={rowAction.row}
        />
      )}
    </>
  );
}
