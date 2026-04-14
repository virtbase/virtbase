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
import type { ResetRootPasswordServerInput } from "@virtbase/validators/server";
import { ResetRootPasswordServerInputSchema } from "@virtbase/validators/server";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { PasswordRequirements } from "@/features/auth/components/password-requirements";
import {
  RandomPasswordAddon,
  ShowPasswordAddon,
} from "@/ui/input-group-addons";
import { useResetRootPassword } from "../../hooks/overview/use-reset-root-password";

export default function ResetRootPasswordDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const { id: serverId } = useParams<{ id: string }>();
  const t = useExtracted();

  const { mutate: resetRootPassword, isPending } = useResetRootPassword({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    },
  });

  const form = useForm<ResetRootPasswordServerInput>({
    defaultValues: {
      server_id: serverId,
      root_password: "",
    },
    resolver: zodResolver(ResetRootPasswordServerInputSchema),
    disabled: isPending,
  });

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // Reset the form when the dialog is closing
  useEffect(() => {
    return () => {
      form.reset();
    };
  }, []);

  return (
    <ResponsiveDialog
      title={t("Reset Root Password")}
      description={t("Reset the root password of your server.")}
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
            form="reset-root-password-form"
            disabled={form.formState.disabled || isPending}
          >
            {isPending && <Spinner />} {t("Reset Root Password")}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="reset-root-password-form"
        onSubmit={form.handleSubmit((data) => resetRootPassword(data))}
      >
        <FieldGroup>
          <Alert variant="destructive">
            <LucideAlertTriangle aria-hidden="true" />
            <AlertTitle>{t("Warning")}</AlertTitle>
            <AlertDescription>
              <p className="text-balance text-foreground text-sm">
                {t.rich(
                  "This action cannot be undone. If the <code>qemu-quest-agent</code> package is not installed, the process will fail.",
                  {
                    code: (chunks) => (
                      <span className="font-mono">{chunks}</span>
                    ),
                  },
                )}
              </p>
            </AlertDescription>
          </Alert>
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
