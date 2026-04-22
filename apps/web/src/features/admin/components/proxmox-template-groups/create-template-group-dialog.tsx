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

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@virtbase/ui/button";
import { Field, FieldGroup, FieldLabel } from "@virtbase/ui/field";
import { Input } from "@virtbase/ui/input";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { CreateProxmoxTemplateGroupInputSchema } from "@virtbase/validators/admin";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { createProxmoxTemplateGroupAction } from "../../api/proxmox-template-groups/create-proxmox-template-group";
import { transformTextField } from "../../lib/transform-text-field";

interface CreateTemplateGroupDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {}

export default function CreateTemplateGroupDialog(
  props: CreateTemplateGroupDialogProps,
) {
  const t = useExtracted();

  const { execute, isPending, reset } = useAction(
    createProxmoxTemplateGroupAction,
    {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
      onError: ({ error }) => {
        toast.error(error.serverError);
      },
    },
  );

  const form = useForm({
    defaultValues: {
      name: "",
      priority: 0,
    },
    resolver: zodResolver(CreateProxmoxTemplateGroupInputSchema),
    disabled: isPending,
  });

  // Reset the form when the dialog is closing
  useEffect(() => {
    return () => {
      form.reset();
      reset();
    };
  }, []);

  const action = t("Create Proxmox Template Group");

  return (
    <ResponsiveDialog
      title={action}
      description={t(
        "Create a new Proxmox VE template group for Proxmox VE templates.",
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
            type="submit"
            form="create-proxmox-template-group-form"
            disabled={form.formState.disabled}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="create-proxmox-template-group-form"
        onSubmit={form.handleSubmit((data) => execute(data))}
      >
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Name")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  type="text"
                  maxLength={64}
                  minLength={1}
                  placeholder="Debian"
                  {...field}
                />
              </Field>
            )}
          />
          <Controller
            name="priority"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Priority")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  {...field}
                  onChange={(e) => field.onChange(transformTextField.output(e))}
                  value={transformTextField.input(field.value)}
                />
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
