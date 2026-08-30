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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@virtbase/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@virtbase/ui/field";
import { LucideChevronDown } from "@virtbase/ui/icons";
import { Input } from "@virtbase/ui/input";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { formatBytes, MAX_ISO_DOWNLOAD_SIZE_BYTES } from "@virtbase/utils";
import type { UploadProxmoxIsoInput } from "@virtbase/validators";
import { UploadProxmoxIsoInputSchema } from "@virtbase/validators";
import { useExtracted, useFormatter } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useUploadCustomImage } from "../../hooks/custom-images/upload-custom-image";
import { IsoCatalogGrid } from "./iso-catalog-grid";

export default function CreateCustomImageDialog({
  ...props
}: Omit<
  React.ComponentProps<typeof ResponsiveDialog>,
  "title" | "description" | "footer"
>) {
  const t = useExtracted();
  const formatter = useFormatter();

  /**
   * A catalog entry and the custom fields are two ways of filling the same two
   * form values, so only one of them may be active at a time. `selectedId` is
   * the catalog entry currently backing the form, `isCustomOpen` means the
   * customer is filling the fields by hand.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const { mutateAsync, isPending } = useUploadCustomImage({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
    },
  });

  const form = useForm<UploadProxmoxIsoInput>({
    defaultValues: {
      name: "",
      url: "",
    },
    resolver: zodResolver(UploadProxmoxIsoInputSchema),
    disabled: isPending,
  });

  useEffect(() => {
    return () => {
      form.reset();
    };
  }, [form.reset]);

  const action = t("Create Custom Image");

  const toggleCustom = (nextOpen: boolean) => {
    setIsCustomOpen(nextOpen);

    // Opening the custom fields takes over from the catalog, so clear the
    // values it filled in - the form always shows what is on screen.
    if (nextOpen && selectedId) {
      setSelectedId(null);
      form.reset({ name: "", url: "" });
    }
  };

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
            disabled={form.formState.disabled || (!selectedId && !isCustomOpen)}
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
        className="flex flex-col gap-4"
      >
        <IsoCatalogGrid
          value={selectedId}
          disabled={isPending}
          onValueChange={(entry) => {
            setSelectedId(entry.id);
            setIsCustomOpen(false);
            form.reset({ name: entry.name, url: entry.url });
          }}
        />

        <Collapsible
          open={isCustomOpen}
          onOpenChange={toggleCustom}
          disabled={isPending}
        >
          <CollapsibleTrigger className="group flex w-fit items-center gap-1.5 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50">
            <LucideChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
            />
            {t("Use a custom image")}
          </CollapsibleTrigger>

          <CollapsibleContent>
            <FieldGroup className="pt-4">
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
                      placeholder="Debian 13 (trixie)"
                      {...field}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
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
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>
      </form>
    </ResponsiveDialog>
  );
}
