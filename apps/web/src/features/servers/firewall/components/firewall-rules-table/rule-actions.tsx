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

import type { Row, Table } from "@tanstack/react-table";
import { cn } from "@virtbase/ui";
import { Button } from "@virtbase/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideEdit,
  LucideMoreVertical,
  LucideTrash2,
} from "@virtbase/ui/icons/index";
import type { DataTableRowAction } from "@virtbase/ui/types";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import { useDeleteFirewallRule } from "../../hooks/use-delete-firewall-rule";
import { useMoveFirewallRule } from "../../hooks/use-move-firewall-rule";
import type { FirewallRulesTableColumn } from "./columns";

interface RuleActionsProps extends React.ComponentProps<"div"> {
  table: Table<FirewallRulesTableColumn>;
  row: Row<FirewallRulesTableColumn>;
  rowAction: DataTableRowAction<FirewallRulesTableColumn> | null;
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<FirewallRulesTableColumn> | null>
  >;
}

export function RuleActions({
  table,
  row,
  rowAction,
  setRowAction,
  className,
  ...props
}: RuleActionsProps) {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();

  const { mutate: moveRule, isPending: isMovePending } = useMoveFirewallRule();
  const { mutate: deleteRule, isPending: isDeletePending } =
    useDeleteFirewallRule();

  const move = useCallback((direction: "up" | "down") => {
    return () => {
      if (direction === "up" && row.original.pos === 0) return;
      if (direction === "down" && row.original.pos === table.getRowCount() - 1)
        return;

      moveRule({
        server_id: serverId,
        pos: row.original.pos,
        moveto: row.original.pos + (direction === "up" ? -1 : 1),
      });
    };
  }, []);

  const isActionsDisabled =
    isMovePending || isDeletePending || rowAction !== null;

  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      <Button
        variant="outline"
        size="icon"
        className="size-8 text-muted-foreground"
        disabled={row.original.pos === 0 || isActionsDisabled}
        onClick={move("up")}
        aria-label={t("Move up")}
      >
        <LucideArrowUp aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8 text-muted-foreground"
        disabled={
          row.original.pos === table.getRowCount() - 1 || isActionsDisabled
        }
        onClick={move("down")}
        aria-label={t("Move down")}
      >
        <LucideArrowDown aria-hidden="true" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-8 text-muted-foreground"
            disabled={isActionsDisabled}
          >
            <LucideMoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => setRowAction({ row, variant: "update" })}
          >
            <LucideEdit aria-hidden="true" />
            <span>{t("Edit")}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              deleteRule({
                server_id: serverId,
                pos: row.original.pos,
              })
            }
            variant="destructive"
          >
            <LucideTrash2 aria-hidden="true" />
            <span>{t("Delete")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
