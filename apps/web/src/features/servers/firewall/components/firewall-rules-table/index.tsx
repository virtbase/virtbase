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

import { flexRender, useTable } from "@tanstack/react-table";
import type { LucideIcon } from "@virtbase/ui/icons";
import {
  LucideBrickWallShield,
  LucideLock,
  LucideShieldCheck,
  LucideShieldX,
} from "@virtbase/ui/icons";
import { dataTableFeatures } from "@virtbase/ui/lib";
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
import type { DataTableRowAction } from "@virtbase/ui/types";
import dynamic from "next/dynamic";
import { useExtracted } from "next-intl";
import { Fragment, useMemo, useState } from "react";
import { AnimatedEmptyState } from "@/ui/animated-empty-state";
import type {
  FirewallTableRow,
  GuestRule,
  HostRule,
} from "../../lib/table-rows";
import { buildFirewallTableRows, countHostRows } from "../../lib/table-rows";
import { useFirewallRulesTableColumns } from "./columns";

const FirewallRuleDialog = dynamic(() => import("../firewall-rule-dialog"), {
  ssr: false,
});

const DeleteFirewallRuleDialog = dynamic(
  () => import("../delete-firewall-rule-dialog"),
  { ssr: false },
);

export function FirewallRulesTable({
  hostRules,
  guestRules,
  guestManager,
  isPending,
}: {
  hostRules?: HostRule[];
  guestRules?: GuestRule[];
  /** The in-VM firewall the guest rules came from, for the group heading. */
  guestManager?: string | null;
  isPending: boolean;
}) {
  const t = useExtracted();

  const rows = useMemo(
    () => buildFirewallTableRows({ hostRules, guestRules }),
    [hostRules, guestRules],
  );
  const hostRuleCount = countHostRows(rows);

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<FirewallTableRow> | null>(null);
  const columns = useFirewallRulesTableColumns({
    hostRuleCount,
    rowAction,
    setRowAction,
  });

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    pageCount: 1,
    enableHiding: false,
    enableSorting: false,
    getRowId: (row) => row.key,
    initialState: {
      columnPinning: { start: [], end: ["actions"] },
    },
  });

  const columnCount = table.getVisibleFlatColumns().length;
  const modelRows = table.getRowModel().rows;

  // A heading is emitted wherever the layer changes, so the table reads top to
  // bottom as the sequence of gates a packet passes. Only worth showing once
  // there is a second layer to tell the first one apart from.
  const hasGuestRows = rows.some((row) => row.layer === "guest");

  return (
    <>
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
            {modelRows.length ? (
              modelRows.map((row, index) => {
                const previous = modelRows[index - 1]?.original.layer;
                const showHeading =
                  hasGuestRows && row.original.layer !== previous;

                return (
                  <Fragment key={row.id}>
                    {showHeading && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={columnCount}
                          className="bg-muted/50 px-6 py-2"
                        >
                          <div className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                            {row.original.layer === "host" ? (
                              <>
                                <LucideBrickWallShield
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
                                {t("Virtbase firewall")}
                              </>
                            ) : (
                              <>
                                <LucideLock
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
                                {guestManager
                                  ? t("Inside your server ({manager})", {
                                      manager: guestManager,
                                    })
                                  : t("Inside your server")}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow
                      data-layer={row.original.layer}
                      className="hover:bg-transparent data-[layer=guest]:bg-muted/20"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell className="px-6 py-4" key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </Fragment>
                );
              })
            ) : !isPending ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="pointer-events-none"
                >
                  <AnimatedEmptyState
                    className="border-none md:pb-0"
                    cardContent={(index) => {
                      const IconRight = [LucideShieldCheck, LucideShieldX][
                        index % 2
                      ] as LucideIcon;

                      return (
                        <>
                          <LucideBrickWallShield aria-hidden="true" />
                          <div className="h-2.5 w-24 min-w-0 rounded-sm bg-muted" />
                          <div className="hidden grow items-center justify-end gap-1.5 sm:flex">
                            <IconRight className="size-3.5 text-muted-foreground" />
                          </div>
                        </>
                      );
                    }}
                    title={t("No Firewall rules")}
                    description={t("No Firewall rules have been created yet.")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell
                    colSpan={columnCount}
                    className="pointer-events-none"
                  >
                    <Skeleton className="h-10" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {rowAction?.variant === "update" &&
        rowAction.row.original.layer === "host" && (
          <FirewallRuleDialog
            mode="update"
            defaultValues={rowAction.row.original.rule}
            open
            onOpenChange={(open) => setRowAction(open ? rowAction : null)}
          />
        )}
      {rowAction?.variant === "delete" &&
        rowAction.row.original.layer === "host" && (
          <DeleteFirewallRuleDialog
            hostRow={rowAction.row.original}
            open
            onOpenChange={(open) => setRowAction(open ? rowAction : null)}
          />
        )}
    </>
  );
}
