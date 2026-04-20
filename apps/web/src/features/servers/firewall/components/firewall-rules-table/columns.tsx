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
import type { DataTableRowAction } from "@virtbase/ui/types";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import type { GetFirewallRulesOutput } from "@/features/servers/firewall/hooks/use-firewall-rules";
import { useFirewallActionMapping } from "../../hooks/use-firewall-action-mapping";
import { useFirewallDirectionMapping } from "../../hooks/use-firewall-direction-mapping";
import { useUpdateFirewallRule } from "../../hooks/use-update-firewall-rule";
import { RuleActions } from "./rule-actions";

export type FirewallRulesTableColumn = GetFirewallRulesOutput["rules"][number];

export function useFirewallRulesTableColumns({
  rowAction,
  setRowAction,
}: {
  rowAction: DataTableRowAction<FirewallRulesTableColumn> | null;
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<FirewallRulesTableColumn> | null>
  >;
}): Array<ColumnDef<FirewallRulesTableColumn>> {
  const t = useExtracted();
  const directionMapping = useFirewallDirectionMapping();
  const actionMapping = useFirewallActionMapping();

  const { id: serverId } = useParams<{ id: string }>();

  return [
    {
      id: "enabled",
      accessorKey: "enabled",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Enabled")} />
      ),
      cell: ({ cell }) => {
        const enabled = cell.getValue<boolean>();
        const position = cell.row.original.pos;

        const { mutate: updateRule } = useUpdateFirewallRule();

        return (
          <div className="flex flex-row items-center gap-4">
            <Checkbox
              checked={enabled}
              aria-label={enabled ? t("Disable rule") : t("Enable rule")}
              onCheckedChange={() =>
                updateRule({
                  server_id: serverId,
                  pos: position,
                  enabled: !enabled,
                })
              }
            />
            <span className="text-muted-foreground tabular-nums">
              {position + 1}
            </span>
          </div>
        );
      },
    },
    {
      id: "direction",
      accessorKey: "direction",
      header: ({ column }) => {
        return <DataTableColumnHeader column={column} label={t("Direction")} />;
      },
      cell: ({ cell }) => {
        const value = cell.getValue<"in" | "out" | undefined>();
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
      accessorKey: "action",
      header: ({ column }) => {
        return <DataTableColumnHeader column={column} label={t("Action")} />;
      },
      cell: ({ cell }) => {
        const value = cell.getValue<"ACCEPT" | "DROP" | "REJECT">();
        const item = actionMapping[value];

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
      accessorKey: "proto",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Protocol")} />
      ),
      cell: ({ cell }) => {
        return (
          <span className="text-muted-foreground">
            {cell.getValue<string>() || "*"}
          </span>
        );
      },
    },
    {
      id: "ports",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Ports")} />
      ),
      cell: ({ row }) => {
        const { sport = "*", dport = "*" } = row.original;

        return (
          <div className="flex items-center gap-2 text-muted-foreground tabular-nums">
            <span>{sport}</span>
            <span>:</span>
            <span>{dport}</span>
          </div>
        );
      },
    },
    {
      id: "comment",
      accessorKey: "comment",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={t("Comment")} />
      ),
      cell: ({ cell }) => (
        <span className="max-w-40 whitespace-normal text-muted-foreground">
          {cell.getValue<string>() || "-"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row, table }) => (
        <RuleActions
          className="justify-end"
          table={table}
          row={row}
          rowAction={rowAction}
          setRowAction={setRowAction}
        />
      ),
      size: 120,
    },
  ];
}
