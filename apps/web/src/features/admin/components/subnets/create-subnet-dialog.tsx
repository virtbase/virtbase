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
import { CreateSubnetInputSchema } from "@virtbase/validators";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { transformTextField } from "@/features/admin/lib/transform-text-field";
import { createSubnetAction } from "../../api/subnets/create-subnet";

export default function CreateSubnetDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const t = useExtracted();

  const form = useForm({
    defaultValues: {
      parent_id: null,
      cidr: "",
      gateway: "",
      vlan: 0,
      dns_reverse_zone: null,
    },
    resolver: zodResolver(CreateSubnetInputSchema),
  });

  const { execute, isPending } = useAction(createSubnetAction, {
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
      title={t("Create Subnet")}
      description={t("Create a new subnet.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
          >
            {t("Cancel")}
          </Button>
          <Button type="submit" form="create-subnet-form" disabled={isPending}>
            {isPending && <Spinner />} {t("Create Subnet")}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="create-subnet-form"
        onSubmit={form.handleSubmit((data) => execute(data))}
      >
        <FieldGroup>
          <Controller
            name="cidr"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("CIDR")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  type="text"
                  placeholder="192.168.1.0/24"
                  {...field}
                />
              </Field>
            )}
          />
          <Controller
            name="gateway"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Gateway")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  type="text"
                  placeholder="192.168.1.1"
                  {...field}
                />
              </Field>
            )}
          />
          <Controller
            name="dns_reverse_zone"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("Reverse DNS Zone")}
                </FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  type="text"
                  placeholder="10.10.10.in-addr.arpa"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              </Field>
            )}
          />
          <Controller
            name="vlan"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("VLAN")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  type="text"
                  inputMode="numeric"
                  placeholder="0-4096"
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
