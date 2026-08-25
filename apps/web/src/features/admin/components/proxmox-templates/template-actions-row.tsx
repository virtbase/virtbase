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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  LucideDownload,
  LucideMoreHorizontal,
  LucideRefreshCw,
  LucideTrash2,
} from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import dynamic from "next/dynamic";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { downloadTemplateImageAction } from "../../api/proxmox-templates/download-template-image";

const DeleteTemplateDialog = dynamic(() => import("./delete-template-dialog"), {
  ssr: false,
});

interface TemplateActionsRowProps {
  template: { id: string; name: string };
}

export function TemplateActionsRow({ template }: TemplateActionsRowProps) {
  const t = useExtracted();
  const [action, setAction] = useState<"delete" | null>(null);

  const { execute, isPending } = useAction(downloadTemplateImageAction, {
    onSuccess: ({ data }) => {
      if (data?.failures.length) {
        toast.warning(data.failures[0]);
      } else {
        toast.success(t("Download started"));
      }
    },
    onError: ({ error }) => toast.error(error.serverError),
  });

  return (
    <>
      <ButtonGroup>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => execute({ id: template.id, force: false })}
        >
          {isPending ? (
            <Spinner />
          ) : (
            <LucideDownload className="text-muted-foreground" aria-hidden />
          )}
          {t("Download image")}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" disabled={isPending}>
              <LucideMoreHorizontal
                className="text-muted-foreground"
                aria-hidden
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={() => execute({ id: template.id, force: true })}
            >
              <LucideRefreshCw aria-hidden />
              {t("Force re-download")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setAction("delete")}
            >
              <LucideTrash2 aria-hidden />
              {t("Delete template")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      {action === "delete" && (
        <DeleteTemplateDialog
          open
          onOpenChange={(open) => setAction(open ? "delete" : null)}
          template={template}
        />
      )}
    </>
  );
}
