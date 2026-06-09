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

import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { useExtracted } from "next-intl";
import type { EmailsTableColumn } from "./emails-table/columns";

interface EmailPreviewDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  row: DataTableRowAction<EmailsTableColumn>["row"];
}

export default function EmailPreviewDialog({
  row,
  ...props
}: EmailPreviewDialogProps) {
  const t = useExtracted();

  const subject = row.original.subject;

  return (
    <ResponsiveDialog
      title={subject}
      description={subject}
      containerClassName="p-0"
      {...props}
    >
      <div className="scrollbar-thin h-[600px] overflow-auto bg-foreground p-4">
        {row.original.html ? (
          <iframe
            className="size-full"
            title={t("Email preview")}
            sandbox="allow-same-origin allow-popups"
            srcDoc={row.original.html}
          />
        ) : row.original.text ? (
          <div className="whitespace-pre-line">
            <span className="font-normal text-background text-sm">
              {row.original.text}
            </span>
          </div>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
