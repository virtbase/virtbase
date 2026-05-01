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
import { formatBytes, MAX_ISO_DOWNLOAD_SIZE_BYTES } from "@virtbase/utils";
import type { UploadProxmoxIsoInput } from "@virtbase/validators";
import { UploadProxmoxIsoInputSchema } from "@virtbase/validators";
import { useExtracted, useFormatter } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useUploadCustomImage } from "../../hooks/custom-images/upload-custom-image";

export default function CreateCustomImageDialog({
  ...props
}: Omit<
  React.ComponentProps<typeof ResponsiveDialog>,
  "title" | "description" | "footer"
>) {
  const t = useExtracted();
  const formatter = useFormatter();

  const { mutateAsync, isPending } = useUploadCustomImage({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
    },
  });

  const form = useForm<UploadProxmoxIsoInput>({
    defaultValues: {
      url: "",
    },
    resolver: zodResolver(UploadProxmoxIsoInputSchema),
    disabled: isPending,
  });

  useEffect(() => {
    return () => {
      form.reset();
    };
  }, []);

  const action = t("Create Custom Image");

  return (
    <ResponsiveDialog
      title={action}
      description={t("Create a new custom image for your servers.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
            disabled={isPending}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            form="create-custom-image-form"
            disabled={form.formState.disabled}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="create-custom-image-form"
        onSubmit={form.handleSubmit((data) => mutateAsync(data))}
      >
        <FieldGroup>
          <Controller
            name="url"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("URL")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/image.iso"
                  {...field}
                />
                <FieldDescription>
                  {t(
                    "The URL must point directly to the ISO file. Maximum file size is {size}.",
                    {
                      size: formatBytes(MAX_ISO_DOWNLOAD_SIZE_BYTES, {
                        formatter,
                      }),
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
