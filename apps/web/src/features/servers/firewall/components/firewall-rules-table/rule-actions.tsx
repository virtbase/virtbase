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
import { useMoveFirewallRule } from "../../hooks/use-move-firewall-rule";
import type { FirewallTableRow, HostFirewallRow } from "../../lib/table-rows";

interface RuleActionsProps extends React.ComponentProps<"div"> {
  row: Row<FirewallTableRow>;
  /** The rule this row shows. Only host rules are editable. */
  hostRow: HostFirewallRow;
  /**
   * How many host rules there are.
   *
   * Passed in rather than read from the table: the table also holds the rules
   * found inside the server, which cannot be reordered, so its row count would
   * put the "move down" boundary in the wrong place.
   */
  hostRuleCount: number;
  rowAction: DataTableRowAction<FirewallTableRow> | null;
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<FirewallTableRow> | null>
  >;
}

export function RuleActions({
  row,
  hostRow,
  hostRuleCount,
  rowAction,
  setRowAction,
  className,
  ...props
}: RuleActionsProps) {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();

  const { mutate: moveRule, isPending: isMovePending } = useMoveFirewallRule();

  const { pos } = hostRow;
  const isFirst = pos === 0;
  const isLast = pos === hostRuleCount - 1;

  const move = useCallback(
    (direction: "up" | "down") => () => {
      if (direction === "up" && isFirst) return;
      if (direction === "down" && isLast) return;

      moveRule({
        server_id: serverId,
        pos,
        moveto: pos + (direction === "up" ? -1 : 1),
      });
    },
    [isFirst, isLast, moveRule, pos, serverId],
  );

  // Deleting runs in the dialog the row action opens, so `rowAction !== null`
  // already covers it.
  const isActionsDisabled = isMovePending || rowAction !== null;

  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      <Button
        variant="outline"
        size="icon"
        className="size-8 text-muted-foreground"
        disabled={isFirst || isActionsDisabled}
        onClick={move("up")}
        aria-label={t("Move up")}
      >
        <LucideArrowUp aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8 text-muted-foreground"
        disabled={isLast || isActionsDisabled}
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
            onSelect={() => setRowAction({ row, variant: "delete" })}
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
