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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
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
  CreateProxmoxTemplateInputSchema,
  TEMPLATE_OS_FAMILIES,
} from "@virtbase/validators/admin";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type * as z from "zod";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import { createProxmoxTemplateAction } from "../../api/proxmox-templates/create-proxmox-template";

type CreateTemplateFormValues = z.input<
  typeof CreateProxmoxTemplateInputSchema
>;

interface CreateTemplateDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  groups: { id: string; name: string }[];
}

/**
 * Creates the template, not its full configuration.
 *
 * Only what a template cannot exist without: a name, a group and the image it
 * is built from. Everything else has a working default and is edited on the
 * detail page, where there is room for it and where the rendered vendor data
 * sits next to it.
 */
export default function CreateTemplateDialog({
  groups,
  ...props
}: CreateTemplateDialogProps) {
  const t = useExtracted();

  const { execute, isPending, reset } = useAction(createProxmoxTemplateAction, {
    onSuccess: () => {
      toast.success(t("Template created"));
      props.onOpenChange?.(false);
    },
    onError: ({ error }) => {
      toast.error(error.serverError);
    },
  });

  const form = useForm<CreateTemplateFormValues>({
    defaultValues: {
      proxmox_template_group_id: groups[0]?.id ?? "",
      name: "",
      icon: null,
      enabled: true,
      required_cores: null,
      recommended_cores: null,
      required_memory: null,
      recommended_memory: null,
      required_storage: null,
      recommended_storage: null,
      image_url: "",
      image_checksum: null,
      image_checksum_algorithm: null,
      image_compression: null,
      image_refresh_days: null,
      architecture: "amd64",
      os_family: null,
      os_version: null,
      package_manager: null,
      init_system: null,
      ostype: "l26",
      cpu_type: "host",
      bios_type: "seabios",
      machine: "q35",
    },
    resolver: zodResolver(CreateProxmoxTemplateInputSchema),
    disabled: isPending,
  });

  // Reset the form when the dialog is closing
  useEffect(() => {
    return () => {
      form.reset();
      reset();
    };
  }, []);

  const action = t("Create Proxmox Template");

  return (
    <ResponsiveDialog
      title={action}
      description={t(
        "Declare an operating system by the image it is built from. Guest details and cloud-init snippets are configured afterwards.",
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
            form="create-proxmox-template-form"
            disabled={form.formState.disabled}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="create-proxmox-template-form"
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
                  placeholder="Debian 13 (Trixie)"
                  {...field}
                />
              </Field>
            )}
          />

          <Controller
            name="proxmox_template_group_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Group")}</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={form.formState.disabled}
                >
                  <SelectTrigger id={field.name} className="w-full">
                    <SelectValue placeholder={t("Select a template group")} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />

          <Controller
            name="icon"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Icon")}</FieldLabel>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <OperatingSystemIcon icon={field.value} />
                  </InputGroupAddon>
                  <InputGroupInput
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="url"
                    placeholder="/assets/static/distros/debian.svg"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value.trim() || null)
                    }
                  />
                </InputGroup>
                {fieldState.error ? (
                  <p className="text-destructive text-xs">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </Field>
            )}
          />

          <Controller
            name="image_url"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Image URL")}</FieldLabel>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  type="url"
                  placeholder="https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2"
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
              name="os_family"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t("OS family")}</FieldLabel>
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(value) =>
                      field.onChange(value === "none" ? null : value)
                    }
                    disabled={form.formState.disabled}
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("Not set")}</SelectItem>
                      {TEMPLATE_OS_FAMILIES.map((value) => (
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
              name="os_version"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    {t("OS version")}
                  </FieldLabel>
                  <Input
                    id={field.name}
                    autoComplete="off"
                    type="text"
                    placeholder="13"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value.trim() || null)
                    }
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
