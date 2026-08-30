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
import { useExtracted, useFormatter } from "next-intl";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import { useDeleteBackup } from "../../hooks/backups/use-delete-backup";
import type { BackupsTableColumn } from "./backups-table/columns";

interface DeleteBackupDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  row: Row<BackupsTableColumn>;
}

/**
 * The confirmation in front of an archive that cannot be brought back.
 *
 * Deleting used to happen straight off the dropdown item, so one mis-click on
 * a menu that also holds "Restore" and "Lock" destroyed a backup with nothing
 * shown either way. This mirrors `RestoreBackupDialog` - same shape, same
 * language - because the two sit next to each other in the same menu.
 */
export default function DeleteBackupDialog({
  row,
  ...props
}: DeleteBackupDialogProps) {
  const t = useExtracted();
  const format = useFormatter();
  const isMobile = useIsMobile();

  const { id: serverId } = useParams<{ id: string }>();

  const { mutate, isPending } = useDeleteBackup({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
    },
  });

  const action = t("Delete backup");
  const backup = row.original;
  const operatingSystem = backup.operating_system;

  return (
    <ResponsiveDialog
      title={action}
      description={t("Delete a backup of your server.")}
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
            onClick={() =>
              mutate({ server_id: serverId, backup_id: backup.id })
            }
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
            "The backup from {date} will be deleted from the node. This cannot be undone.",
            {
              date: format.dateTime(backup.started_at, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }),
            },
          )}
        </p>
        <div className="space-y-2">
          <p>{t("The following operating system will be lost:")}</p>
          <div className="flex items-center gap-2">
            <OperatingSystemIcon icon={operatingSystem?.icon} />
            <span className="truncate">
              {operatingSystem?.name ?? t("Unknown")}
            </span>
          </div>
        </div>
        <p>{t("Should the backup be deleted?")}</p>
      </div>
    </ResponsiveDialog>
  );
}
