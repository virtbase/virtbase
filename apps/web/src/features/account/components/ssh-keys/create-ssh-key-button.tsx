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
import { Textarea } from "@virtbase/ui/textarea";
import { CreateSSHKeyInputSchema } from "@virtbase/validators";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type z4 from "zod/v4";
import { useCreateSSHKey } from "@/features/account/hooks/ssh-keys/create-ssh-key";

export function CreateSSHKeyButton() {
  const t = useExtracted();

  const [open, setOpen] = useState(false);

  const form = useForm<z4.infer<typeof CreateSSHKeyInputSchema>>({
    defaultValues: {
      name: "",
      public_key: "",
    },
    resolver: zodResolver(CreateSSHKeyInputSchema),
    disabled: !open,
  });

  const { mutate: createSSHKey, isPending: isCreatingSSHKey } = useCreateSSHKey(
    {
      mutationConfig: {
        onSuccess: () => {
          form.reset();
          setOpen(false);
        },
        onError: ({ message }) => {
          toast.error(message);
        },
      },
    },
  );

  const action = t("Create SSH key");

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {action}
      </Button>
      <ResponsiveDialog
        title={action}
        description={action}
        open={open}
        onOpenChange={setOpen}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
              disabled={form.formState.disabled || isCreatingSSHKey}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              form="create-ssh-key-form"
              disabled={form.formState.disabled || isCreatingSSHKey}
            >
              {isCreatingSSHKey && <Spinner />} {action}
            </Button>
          </>
        }
      >
        <form
          id="create-ssh-key-form"
          onSubmit={form.handleSubmit((data) => createSSHKey(data))}
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex flex-row items-center justify-between gap-2">
                    <FieldLabel htmlFor={field.name}>{t("Name")}</FieldLabel>
                    <span className="flex font-normal text-muted-foreground text-sm">
                      <span className="flex w-5 justify-end">
                        {field.value?.length ?? 0}
                      </span>
                      <span>/64</span>
                    </span>
                  </div>
                  <Input
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="text"
                    maxLength={64}
                    minLength={1}
                    placeholder={t("My SSH key")}
                    {...field}
                  />
                </Field>
              )}
            />
            <Controller
              name="public_key"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex flex-row items-center justify-between gap-2">
                    <FieldLabel htmlFor={field.name}>
                      {t("Public key")}
                    </FieldLabel>
                    <span className="flex font-normal text-muted-foreground text-sm">
                      <span className="flex w-5 justify-end">
                        {field.value?.length ?? 0}
                      </span>
                      <span>/8192</span>
                    </span>
                  </div>
                  <Textarea
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="ssh-rsa AAAAB3NzaC1yc2..."
                    className="scrollbar-thin min-h-48 select-auto resize-none whitespace-pre-wrap break-all font-mono"
                    minLength={1}
                    maxLength={8192}
                    {...field}
                  />
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </ResponsiveDialog>
    </>
  );
}
