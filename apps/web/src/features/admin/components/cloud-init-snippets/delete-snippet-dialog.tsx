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
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { deleteSnippetAction } from "../../api/cloud-init-snippets/mutate-snippet";

interface DeleteSnippetDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  snippet: { id: string; name: string; matchCount: number };
}

export default function DeleteSnippetDialog({
  snippet,
  ...props
}: DeleteSnippetDialogProps) {
  const t = useExtracted();

  const { execute, isPending } = useAction(deleteSnippetAction, {
    onSuccess: () => {
      toast.success(t("Snippet deleted"));
      props.onOpenChange?.(false);
    },
    onError: ({ error }) => toast.error(error.serverError),
  });

  return (
    <ResponsiveDialog
      title={t("Delete snippet")}
      description={t(
        "Servers provisioned from now on will no longer receive it. Guests that already have it are unaffected.",
      )}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => execute({ id: snippet.id })}
          >
            {isPending && <Spinner />} {t("Delete")}
          </Button>
        </>
      }
      {...props}
    >
      <p className="text-sm">
        {t("{name} currently applies to {count} templates.", {
          name: snippet.name,
          count: String(snippet.matchCount),
        })}
      </p>
    </ResponsiveDialog>
  );
}
