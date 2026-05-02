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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@virtbase/ui/field";
import { LucideAlertTriangle } from "@virtbase/ui/icons/index";
import { Input } from "@virtbase/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { ResetServerPasswordServerInputSchema } from "@virtbase/validators/server";
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
import { useResetServerPassword } from "../../hooks/overview/use-reset-server-password";

export default function ResetServerPasswordDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const { id: serverId } = useParams<{ id: string }>();
  const t = useExtracted();

  const { mutate: resetServerPassword, isPending } = useResetServerPassword({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    },
  });

  const form = useForm({
    defaultValues: {
      server_id: serverId,
      username: "root",
      password: "",
    },
    resolver: zodResolver(ResetServerPasswordServerInputSchema),
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
      title={t("Reset Password")}
      description={t("Reset the password of a user on your server.")}
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
            form="reset-server-password-form"
            disabled={form.formState.disabled || isPending}
          >
            {isPending && <Spinner />} {t("Reset Password")}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="reset-server-password-form"
        onSubmit={form.handleSubmit((data) => resetServerPassword(data))}
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
            name="username"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex flex-row items-center justify-between gap-2">
                  <FieldLabel htmlFor={field.name}>{t("Username")}</FieldLabel>
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
                  autoCapitalize="off"
                  spellCheck={false}
                  type="text"
                  maxLength={64}
                  minLength={1}
                  placeholder="root"
                  {...field}
                />
                <FieldDescription>
                  {t.rich(
                    "The username of the account to reset the password for. Mostly <code>root</code> for Linux and <code>Administrator</code> for Windows.",
                    {
                      code: (chunks) => (
                        <span className="font-mono">{chunks}</span>
                      ),
                    },
                  )}
                </FieldDescription>
              </Field>
            )}
          />
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("New Password")}
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
                        form.setValue("password", password, {
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
