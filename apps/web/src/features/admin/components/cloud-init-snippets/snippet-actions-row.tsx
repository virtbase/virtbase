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

import { Button } from "@virtbase/ui/button";
import { ButtonGroup } from "@virtbase/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import { LucideMoreHorizontal, LucideTrash2 } from "@virtbase/ui/icons";
import dynamic from "next/dynamic";
import { useExtracted } from "next-intl";
import { useState } from "react";

const DeleteSnippetDialog = dynamic(() => import("./delete-snippet-dialog"), {
  ssr: false,
});

export function SnippetActionsRow({
  snippet,
}: {
  snippet: { id: string; name: string; matchCount: number };
}) {
  const t = useExtracted();
  const [action, setAction] = useState<"delete" | null>(null);

  return (
    <>
      <ButtonGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <LucideMoreHorizontal
                className="text-muted-foreground"
                aria-hidden
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setAction("delete")}
            >
              <LucideTrash2 aria-hidden />
              {t("Delete snippet")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      {action === "delete" && (
        <DeleteSnippetDialog
          open
          onOpenChange={(open) => setAction(open ? "delete" : null)}
          snippet={snippet}
        />
      )}
    </>
  );
}
