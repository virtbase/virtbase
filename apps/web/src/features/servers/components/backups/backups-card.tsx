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

import { cn } from "@virtbase/ui";
import { Button } from "@virtbase/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { LucidePlus, LucideRefreshCw } from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useBackupList } from "../../hooks/backups/use-backup-list";
import { useBackupsTable } from "../../hooks/backups/use-backups-table";
import { BackupsTable } from "./backups-table";
import { CreateBackupButton } from "./create-backup-button";

const RestoreBackupDialog = dynamic(() => import("./restore-backup-dialog"), {
  ssr: false,
});

export function BackupsCard() {
  const t = useExtracted();

  const { id } = useParams<{ id: string }>();
  const {
    data: { backups, meta } = {},
    isPending,
    isRefetching,
    refetch,
  } = useBackupList({ server_id: id });

  const { table, rowAction, setRowAction } = useBackupsTable({
    data: backups ?? [],
  });

  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t("Backups")}</CardTitle>
          <div className="flex items-center gap-2">
            <CreateBackupButton disabled={isRefetching || isPending}>
              <LucidePlus aria-hidden="true" />
            </CreateBackupButton>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isRefetching || isPending}
            >
              <LucideRefreshCw
                className={cn((isRefetching || isPending) && "animate-spin")}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <BackupsTable table={table} isPending={isPending} />
        {rowAction && rowAction.variant === "restore" && (
          <RestoreBackupDialog
            row={rowAction.row}
            onOpenChange={(open) => setRowAction(open ? rowAction : null)}
            open={rowAction.variant === "restore"}
          />
        )}
      </CardContent>
      <CardFooter className="border-t [.border-t]:py-4">
        <div className="flex flex-wrap items-center gap-2">
          {isPending || !meta ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <span className="text-muted-foreground text-sm">
              {t("{count, plural, =1 {# Backup} other {# Backups}}", {
                count: meta.pagination.total_entries,
              })}
            </span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
