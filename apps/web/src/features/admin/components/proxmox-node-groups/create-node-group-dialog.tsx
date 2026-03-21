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
import type { CreateProxmoxNodeGroupInput } from "@virtbase/validators/admin";
import { CreateProxmoxNodeGroupInputSchema } from "@virtbase/validators/admin";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { createProxmoxNodeGroupAction } from "../../api/proxmox-node-groups/create-proxmox-node-group";

export function CreateNodeGroupDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const t = useExtracted();

  const form = useForm<CreateProxmoxNodeGroupInput>({
    defaultValues: {
      name: "",
    },
    resolver: zodResolver(CreateProxmoxNodeGroupInputSchema),
  });

  const { execute, isPending } = useAction(createProxmoxNodeGroupAction, {
    onSuccess: () => {
      form.reset();
      props.onOpenChange?.(false);
    },
    onError: ({ error }) => {
      toast.error(error.serverError);
    },
  });

  return (
    <ResponsiveDialog
      title={t("Create Proxmox Node Group")}
      description={t(
        "Create a new Proxmox VE node group for Proxmox VE nodes.",
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
            form="create-proxmox-node-group-form"
            disabled={isPending}
          >
            {isPending && <Spinner />} {t("Create Proxmox Node Group")}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="create-proxmox-node-group-form"
        onSubmit={form.handleSubmit((data) => execute(data))}
        {...props}
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
                  placeholder="EPYC 7443P Nodes"
                  {...field}
                />
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
