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
import { useServerActionState } from "../../hooks/use-server-action-state";
import { BackupsTable } from "./backups-table";

const CreateBackupDialog = dynamic(() => import("./create-backup-dialog"), {
  ssr: false,
});

export function BackupsCard() {
  const t = useExtracted();

  const { action, setAction } = useServerActionState();

  const { id } = useParams<{ id: string }>();
  const {
    data: { backups, meta } = {},
    isPending,
    isRefetching,
    refetch,
  } = useBackupList({ server_id: id });

  const { table } = useBackupsTable({ data: backups ?? [] });

  return (
    <>
      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t("Backups")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAction("create-backup")}
                disabled={
                  isRefetching || isPending || action === "create-backup"
                }
              >
                <LucidePlus aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={
                  isRefetching || isPending || action === "create-backup"
                }
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
      {action === "create-backup" && (
        <CreateBackupDialog
          onOpenChange={(open) => setAction(open ? "create-backup" : null)}
          open
        />
      )}
    </>
  );
}
