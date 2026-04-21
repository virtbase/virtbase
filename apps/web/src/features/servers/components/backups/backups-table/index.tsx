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

import type { Table as TableType } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { LucideDatabaseBackup, LucideRefreshCcw } from "@virtbase/ui/icons";
import { ScrollArea, ScrollBar } from "@virtbase/ui/scroll-area";
import { Skeleton } from "@virtbase/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@virtbase/ui/table";
import { useExtracted } from "next-intl";
import { AnimatedEmptyState } from "@/ui/animated-empty-state";
import type { BackupsTableColumn } from "./columns";

export function BackupsTable({
  table,
  isPending,
}: {
  table: TableType<BackupsTableColumn>;
  isPending: boolean;
}) {
  const t = useExtracted();

  return (
    <ScrollArea className="h-96 w-full">
      <Table>
        <TableHeader className="sticky top-0 z-20 bg-accent">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead
                  className="px-6"
                  key={header.id}
                  colSpan={header.colSpan}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="bg-card">
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="hover:bg-transparent"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell className="px-6 py-4" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : !isPending ? (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleFlatColumns().length}
                className="pointer-events-none"
              >
                <AnimatedEmptyState
                  className="border-none md:pb-0"
                  cardContent={() => (
                    <>
                      <LucideDatabaseBackup aria-hidden="true" />
                      <div className="h-2.5 w-24 min-w-0 rounded-sm bg-muted" />
                      <div className="hidden grow items-center justify-end gap-1.5 sm:flex">
                        <LucideRefreshCcw className="size-3.5 text-muted-foreground" />
                      </div>
                    </>
                  )}
                  title={t("No backups")}
                  description={t("No backups have been created yet.")}
                />
              </TableCell>
            </TableRow>
          ) : (
            Array.from({ length: 4 }).map((_, index) => {
              return (
                <TableRow key={index}>
                  <TableCell
                    colSpan={table.getVisibleFlatColumns().length}
                    className="pointer-events-none"
                  >
                    <Skeleton className="h-10" />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
