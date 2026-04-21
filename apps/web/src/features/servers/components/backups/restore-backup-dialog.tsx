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
import { useRestoreBackup } from "../../hooks/backups/use-restore-backup";
import type { BackupsTableColumn } from "./backups-table/columns";

interface RestoreBackupDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  row: Row<BackupsTableColumn>;
}

export default function RestoreBackupDialog({
  row,
  ...props
}: RestoreBackupDialogProps) {
  const t = useExtracted();
  const format = useFormatter();
  const isMobile = useIsMobile();

  const { id: serverId } = useParams<{ id: string }>();

  const { mutate, isPending } = useRestoreBackup({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
    },
  });

  const action = t("Restore backup");
  const backup = row.original;
  const template = typeof backup.template === "object" ? backup.template : null;

  return (
    <ResponsiveDialog
      title={action}
      description={t("Restore a backup to your server.")}
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
            "By restoring the backup, the current state of the server will be reset to the state of the backup from {date}.",
            {
              date: format.dateTime(backup.started_at, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            },
          )}
        </p>
        <div className="space-y-2">
          <p>{t("The following operating system will be restored:")}</p>
          <div className="flex items-center gap-2">
            <OperatingSystemIcon icon={template?.icon} />
            <span className="truncate">{template?.name ?? t("Unknown")}</span>
          </div>
        </div>
        <p>{t("Should the backup be restored?")}</p>
      </div>
    </ResponsiveDialog>
  );
}
