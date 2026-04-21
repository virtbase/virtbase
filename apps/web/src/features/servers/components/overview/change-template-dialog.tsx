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
import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import { Field, FieldGroup, FieldLabel } from "@virtbase/ui/field";
import { LucideAlertTriangle } from "@virtbase/ui/icons/index";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import type { ChangeTemplateServerInput } from "@virtbase/validators/server";
import { ChangeTemplateServerInputSchema } from "@virtbase/validators/server";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PasswordRequirements } from "@/features/auth/components/password-requirements";
import {
  RandomPasswordAddon,
  ShowPasswordAddon,
} from "@/ui/input-group-addons";
import { OperatingSystemSelect } from "@/ui/operating-system-select";
import { useChangeTemplate } from "../../hooks/overview/use-change-template";
import { useServerTemplateGroups } from "../../hooks/overview/use-template-groups";

interface ChangeTemplateDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {}

export default function ChangeTemplateDialog({
  ...props
}: ChangeTemplateDialogProps) {
  const t = useExtracted();
  const { id: serverId } = useParams<{ id: string }>();

  const { data = { template_groups: [] }, isPending: isTemplateGroupsPending } =
    useServerTemplateGroups({
      server_id: serverId,
    });

  const templateGroups = data.template_groups;

  const { mutate: changeTemplate, isPending: isChangePending } =
    useChangeTemplate({
      mutationConfig: {
        onSuccess: () => {
          props.onOpenChange?.(false);
        },
      },
    });

  const form = useForm<ChangeTemplateServerInput>({
    defaultValues: {
      template_id: "",
      root_password: "",
      // Hidden, but required by schema
      server_id: serverId,
    },
    resolver: zodResolver(ChangeTemplateServerInputSchema),
    disabled:
      isTemplateGroupsPending || templateGroups.length === 0 || isChangePending,
  });

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const action = t("Change operating system");

  return (
    <ResponsiveDialog
      title={action}
      description={t("Change the operating system of your server.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
            disabled={isChangePending}
          >
            {t("Cancel")}
          </Button>
          <Button
            variant="destructive"
            type="submit"
            form="change-template-form"
            disabled={form.formState.disabled}
          >
            {isChangePending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="change-template-form"
        onSubmit={form.handleSubmit((data) => changeTemplate(data))}
      >
        <FieldGroup>
          <Alert variant="destructive">
            <LucideAlertTriangle aria-hidden="true" />
            <AlertTitle>{t("Warning")}</AlertTitle>
            <AlertDescription>
              <p>
                {t(
                  "By changing the operating system, all data will be permanently deleted.",
                )}
              </p>
            </AlertDescription>
          </Alert>
          <Controller
            name="template_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("New Operating System")}
                </FieldLabel>
                <OperatingSystemSelect
                  id={field.name}
                  name={field.name}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  templateGroups={templateGroups.map((group) => ({
                    ...group,
                    templates: group.templates.map((template) => ({
                      ...template,
                      requiredCores: template.required_cores,
                      recommendedCores: template.recommended_cores,
                      requiredMemory: template.required_memory,
                      recommendedMemory: template.recommended_memory,
                      requiredStorage: template.required_storage,
                      recommendedStorage: template.recommended_storage,
                    })),
                  }))}
                  aria-invalid={fieldState.invalid}
                  disabled={form.formState.disabled}
                  modal={true}
                />
              </Field>
            )}
          />
          <Controller
            name="root_password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("New Root Password")}
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    placeholder="********"
                    type={!isPasswordVisible ? "password" : "text"}
                    disabled={form.formState.disabled}
                    {...field}
                  />
                  <InputGroupAddon align="inline-end">
                    <RandomPasswordAddon
                      onClick={(password) => {
                        form.setValue("root_password", password, {
                          shouldDirty: true,
                          shouldValidate: true,
                          shouldTouch: true,
                        });
                        setIsPasswordVisible(true);
                      }}
                      disabled={form.formState.disabled}
                    />
                    <ShowPasswordAddon
                      isPasswordVisible={isPasswordVisible}
                      setIsPasswordVisible={setIsPasswordVisible}
                      disabled={form.formState.disabled}
                    />
                  </InputGroupAddon>
                </InputGroup>
                <PasswordRequirements
                  field={field}
                  invalid={fieldState.invalid}
                />
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
