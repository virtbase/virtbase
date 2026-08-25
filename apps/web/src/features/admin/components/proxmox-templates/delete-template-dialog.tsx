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
import { deleteProxmoxTemplateAction } from "../../api/proxmox-templates/create-proxmox-template";

interface DeleteTemplateDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  template: { id: string; name: string };
}

export default function DeleteTemplateDialog({
  template,
  ...props
}: DeleteTemplateDialogProps) {
  const t = useExtracted();

  const { execute, isPending } = useAction(deleteProxmoxTemplateAction, {
    onSuccess: () => {
      toast.success(t("Template deleted"));
      props.onOpenChange?.(false);
    },
    onError: ({ error }) => toast.error(error.serverError),
  });

  return (
    <ResponsiveDialog
      title={t("Delete template")}
      description={t(
        "This cannot be undone. A template a server was built from cannot be deleted - that reference records which operating system the customer chose.",
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
            onClick={() => execute({ id: template.id })}
          >
            {isPending && <Spinner />} {t("Delete")}
          </Button>
        </>
      }
      {...props}
    >
      <p className="text-sm">{template.name}</p>
    </ResponsiveDialog>
  );
}
