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
import type { RenameServerInput } from "@virtbase/validators/server";
import { RenameServerInputSchema } from "@virtbase/validators/server";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRenameServer } from "../../hooks/overview/use-rename-server";

export function RenameServerDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const { id: serverId } = useParams<{ id: string }>();
  const t = useExtracted();

  const form = useForm<RenameServerInput>({
    defaultValues: {
      server_id: serverId,
      name: "",
    },
    resolver: zodResolver(RenameServerInputSchema),
  });

  const { mutate: renameServer, isPending } = useRenameServer({
    mutationConfig: {
      onSuccess: () => {
        form.reset();
        props.onOpenChange?.(false);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    },
  });

  return (
    <ResponsiveDialog
      title={t("Rename Server")}
      description={t("Rename your server.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
          >
            {t("Cancel")}
          </Button>
          <Button type="submit" form="rename-server-form" disabled={isPending}>
            {isPending && <Spinner />} {t("Rename Server")}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="rename-server-form"
        onSubmit={form.handleSubmit((data) => renameServer(data))}
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
                  maxLength={64}
                  placeholder={t("My Server")}
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
