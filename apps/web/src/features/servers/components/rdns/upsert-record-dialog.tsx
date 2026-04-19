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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@virtbase/ui/field";
import { Input } from "@virtbase/ui/input";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import type { UpsertPointerRecordInput } from "@virtbase/validators/server";
import { UpsertPointerRecordInputSchema } from "@virtbase/validators/server";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useUpsertPointerRecord } from "../../hooks/rdns/use-upsert-pointer-record";

export default function UpsertRecordDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();
  const { mutate, isPending } = useUpsertPointerRecord({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
    },
  });

  const form = useForm<UpsertPointerRecordInput>({
    defaultValues: {
      ip: "",
      hostname: "",
      // Hidden, but required by the schema
      server_id: serverId,
    },
    resolver: zodResolver(UpsertPointerRecordInputSchema),
    disabled: isPending,
  });

  useEffect(() => {
    return () => {
      form.reset();
    };
  }, []);

  const action = t("Update PTR Record");

  return (
    <ResponsiveDialog
      title={action}
      description={t("Update a PTR record for a given IP and hostname.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              props.onOpenChange?.(false);
            }}
            disabled={isPending}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            form="upsert-record-form"
            disabled={form.formState.disabled}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="upsert-record-form"
        onSubmit={form.handleSubmit((data) => mutate(data))}
      >
        <FieldGroup>
          <Controller
            name="ip"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("IP Address")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  placeholder="192.168.1.1 | 2001:db8::1"
                  {...field}
                />
                <FieldDescription>
                  {t(
                    "PTR records can be created for all IP addresses assigned to this server.",
                  )}
                </FieldDescription>
              </Field>
            )}
          />
          <Controller
            name="hostname"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Hostname")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  placeholder="vm01.example.com"
                  {...field}
                />
                <FieldDescription>
                  {t.rich(
                    "The hostname to resolve for the IP address. <code>localhost</code> is not allowed.",
                    {
                      code: (chunks) => <code>{chunks}</code>,
                    },
                  )}
                </FieldDescription>
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
