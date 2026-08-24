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

import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@virtbase/ui/checkbox";
import { DataTableColumnHeader } from "@virtbase/ui/data-table/data-table-column-header";
import { LucideLock } from "@virtbase/ui/icons/index";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@virtbase/ui/tooltip";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import { useFirewallActionMapping } from "../../hooks/use-firewall-action-mapping";
import { useFirewallDirectionMapping } from "../../hooks/use-firewall-direction-mapping";
import { useUpdateFirewallRule } from "../../hooks/use-update-firewall-rule";
import type { FirewallTableRow } from "../../lib/table-rows";
import { RuleActions } from "./rule-actions";

export type FirewallRulesTableColumn = FirewallTableRow;

export function useFirewallRulesTableColumns({
  hostRuleCount,
  rowAction,
  setRowAction,
}: {
  hostRuleCount: number;
  rowAction: DataTableRowAction<FirewallTableRow> | null;
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<FirewallTableRow> | null>
  >;
}): Array<ColumnDef<FirewallTableRow>> {
  const t = useExtracted();
  const directionMapping = useFirewallDirectionMapping();
  const actionMapping = useFirewallActionMapping();

  const { id: serverId } = useParams<{ id: string }>();

  // Hoisted out of the cell renderer on purpose. Cells now branch on the layer,
  // and a hook called inside a branch would break the rules of hooks the first
  // time a server has an in-VM firewall.
  const { mutate: updateRule } = useUpdateFirewallRule();

  return [
    {
      id: "enabled",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Enabled")} />
      ),
      cell: ({ row }) => {
        const item = row.original;

        // Rules inside the server are read-only: Virtbase can see them, but
        // changing them means running commands in the customer's machine.
        if (item.layer === "guest") {
          return (
            <div className="flex flex-row items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <LucideLock
                      aria-label={t("Managed inside your server")}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("Managed inside your server")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="text-muted-foreground tabular-nums">
                {item.index ?? "-"}
              </span>
            </div>
          );
        }

        return (
          <div className="flex flex-row items-center gap-4">
            <Checkbox
              checked={item.enabled}
              aria-label={item.enabled ? t("Disable rule") : t("Enable rule")}
              onCheckedChange={() =>
                updateRule({
                  server_id: serverId,
                  pos: item.pos,
                  enabled: !item.enabled,
                })
              }
            />
            <span className="text-muted-foreground tabular-nums">
              {item.pos + 1}
            </span>
          </div>
        );
      },
    },
    {
      id: "direction",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Direction")} />
      ),
      cell: ({ row }) => {
        const value = row.original.direction;
        const item = value ? directionMapping[value] : null;

        if (!item) {
          return <span className="text-muted-foreground">*</span>;
        }

        return (
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <item.icon aria-hidden="true" className="size-4 shrink-0" />
            {item.label}
          </div>
        );
      },
    },
    {
      id: "action",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Action")} />
      ),
      cell: ({ row }) => {
        const value = row.original.action;
        const item = value ? actionMapping[value] : null;

        // A logging rule or a jump into another chain decides nothing itself.
        if (!item) {
          return <span className="text-muted-foreground">-</span>;
        }

        return (
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <item.icon aria-hidden="true" className="size-4 shrink-0" />
            {item.label}
          </div>
        );
      },
    },
    {
      id: "proto",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Protocol")} />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.proto || "*"}
        </span>
      ),
    },
    {
      id: "ports",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Ports")} />
      ),
      cell: ({ row }) => {
        const { sport, dport } = row.original;

        return (
          <div className="flex items-center gap-2 text-muted-foreground tabular-nums">
            <span>{sport || "*"}</span>
            <span>:</span>
            <span>{dport || "*"}</span>
          </div>
        );
      },
    },
    {
      id: "comment",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Comment")} />
      ),
      cell: ({ row }) => {
        const item = row.original;

        if (item.layer === "host") {
          return (
            <span className="max-w-40 whitespace-normal text-muted-foreground">
              {item.comment || "-"}
            </span>
          );
        }

        // Not every in-VM rule can be fully interpreted, so the line the
        // firewall itself printed is shown rather than a row of empty columns.
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block max-w-56 truncate font-mono text-muted-foreground text-xs">
                  {item.comment || item.raw}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <span className="wrap-break-word font-mono text-xs">
                  {item.raw}
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const item = row.original;

        if (item.layer === "guest") {
          return null;
        }

        return (
          <RuleActions
            className="justify-end"
            row={row}
            hostRow={item}
            hostRuleCount={hostRuleCount}
            rowAction={rowAction}
            setRowAction={setRowAction}
          />
        );
      },
      size: 120,
    },
  ];
}
