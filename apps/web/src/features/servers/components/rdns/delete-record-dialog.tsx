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

import type { Row } from "@tanstack/react-table";
import { Button } from "@virtbase/ui/button";
import { useIsMobile } from "@virtbase/ui/hooks";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useDeletePointerRecord } from "@/features/servers/hooks/rdns/use-delete-pointer-record";
import type { RecordsTableColumn } from "./records-table/columns";

interface DeleteRecordDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  row: Row<RecordsTableColumn>;
}

/**
 * The confirmation in front of dropping a PTR record.
 *
 * The record is a single icon button in a dense table, and removing it breaks
 * whatever relies on the reverse lookup - outbound mail most of all. Worth a
 * question first.
 */
export default function DeleteRecordDialog({
  row,
  ...props
}: DeleteRecordDialogProps) {
  const t = useExtracted();
  const isMobile = useIsMobile();

  const { id: serverId } = useParams<{ id: string }>();

  const { mutate, isPending } = useDeletePointerRecord({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
    },
  });

  const action = t("Delete PTR record");
  const record = row.original;

  return (
    <ResponsiveDialog
      title={action}
      description={t("Delete a PTR record of your server.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              props.onOpenChange?.(false);
            }}
            disabled={isPending}
            autoFocus={!isMobile}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            onClick={() => mutate({ server_id: serverId, id: record.id })}
            disabled={isPending}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <div className="flex flex-col gap-6">
        <p>
          {t(
            "The reverse lookup for {ip} will no longer resolve to {hostname}. Mail sent from this address may be rejected.",
            { ip: record.ip, hostname: record.hostname },
          )}
        </p>
        <p>{t("Should the PTR record be deleted?")}</p>
      </div>
    </ResponsiveDialog>
  );
}
