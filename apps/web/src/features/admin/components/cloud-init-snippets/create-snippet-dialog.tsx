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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { Spinner } from "@virtbase/ui/spinner";
import {
  CreateCloudInitSnippetInputSchema,
  SNIPPET_KINDS,
} from "@virtbase/validators/admin";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type * as z from "zod";
import { paths } from "@/lib/paths";
import { createSnippetAction } from "../../api/cloud-init-snippets/mutate-snippet";

type CreateSnippetFormValues = z.input<
  typeof CreateCloudInitSnippetInputSchema
>;

/**
 * A body that already parses, so a new snippet is valid the moment it exists
 * and the editor opens on something rather than a blank page.
 */
const STARTER_CONTENT: Record<(typeof SNIPPET_KINDS)[number], string> = {
  "cloud-config": "#cloud-config\n# Merged into the guest's vendor data.\n",
  shell: "#!/bin/sh\n# Runs once on first boot.\nset -e\n",
};

interface CreateSnippetDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {}

/**
 * Creates the snippet, then hands over to the editor.
 *
 * The body is the part that needs room and a language mode, so it is not asked
 * for here - a starter that parses is stored and the operator lands on the
 * editor page with it open.
 */
export default function CreateSnippetDialog(props: CreateSnippetDialogProps) {
  const t = useExtracted();
  const router = useRouter();

  const { execute, isPending, reset } = useAction(createSnippetAction, {
    onSuccess: ({ data }) => {
      props.onOpenChange?.(false);
      if (data?.id) {
        router.push(paths.admin.snippets.overview.getHref(data.id));
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError);
    },
  });

  const form = useForm<CreateSnippetFormValues>({
    defaultValues: {
      slug: "",
      name: "",
      description: null,
      kind: "cloud-config",
      scope: "base",
      content: STARTER_CONTENT["cloud-config"],
      targets: {},
      priority: 100,
      enabled: true,
    },
    resolver: zodResolver(CreateCloudInitSnippetInputSchema),
    disabled: isPending,
  });

  // Reset the form when the dialog is closing
  useEffect(() => {
    return () => {
      form.reset();
      reset();
    };
  }, [form.reset, reset]);

  const action = t("Create Snippet");

  return (
    <ResponsiveDialog
      title={action}
      description={t(
        "Snippets compose into the cloud-init vendor data a guest receives on first boot. You will write the body next.",
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
            form="create-cloud-init-snippet-form"
            disabled={form.formState.disabled}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="create-cloud-init-snippet-form"
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
                  maxLength={128}
                  minLength={1}
                  placeholder={t("Install fail2ban")}
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);

                    // Suggest a slug while the operator has not set one, then
                    // stop - a slug is a stable handle and should not keep
                    // changing under an edited name.
                    if (!form.formState.dirtyFields.slug) {
                      form.setValue(
                        "slug",
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-+|-+$/g, ""),
                      );
                    }
                  }}
                />
              </Field>
            )}
          />

          <Controller
            name="slug"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Slug")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  type="text"
                  placeholder="install-fail2ban"
                  {...field}
                />
                {fieldState.error ? (
                  <p className="text-destructive text-xs">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </Field>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              name="kind"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t("Kind")}</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue(
                        "content",
                        STARTER_CONTENT[
                          value as (typeof SNIPPET_KINDS)[number]
                        ],
                      );
                    }}
                    disabled={form.formState.disabled}
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SNIPPET_KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <Controller
              name="priority"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t("Priority")}</FieldLabel>
                  <Input
                    id={field.name}
                    autoComplete="off"
                    type="number"
                    {...field}
                    value={field.value ?? 0}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </Field>
              )}
            />
          </div>
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
