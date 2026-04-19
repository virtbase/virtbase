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
import { LucidePencil, LucideRefreshCw } from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { usePointerRecordsList } from "../../hooks/rdns/use-pointer-records-list";
import { RecordsTable } from "./records-table";
import { UpsertRecordButton } from "./upsert-record-button";

export function RecordsCard() {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();
  const { data, isPending, isRefetching, refetch } = usePointerRecordsList({
    server_id: serverId,
  });

  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t("PTR Records")}</CardTitle>
          <div className="flex items-center gap-2">
            <UpsertRecordButton disabled={isRefetching || isPending}>
              <LucidePencil aria-hidden="true" />
            </UpsertRecordButton>
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
        <RecordsTable data={data} isPending={isPending} />
      </CardContent>
      <CardFooter className="border-t [.border-t]:py-4">
        <div className="flex flex-wrap items-center gap-2">
          {isPending || !data?.meta ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <span className="text-muted-foreground text-sm">
              {t("{count, plural, =1 {# PTR record} other {# PTR records}}", {
                count: data.meta.pagination.total_entries,
              })}
            </span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
