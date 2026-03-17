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
import { useMediaQuery } from "@virtbase/ui/hooks";
import { Input } from "@virtbase/ui/input";
import { Spinner } from "@virtbase/ui/spinner";
import { SignUpSchema } from "@virtbase/validators/auth";
import { useExtracted } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type z from "zod";
import { PasswordRequirements } from "@/features/auth/components/password-requirements";
import { authClient } from "@/lib/auth/client";
import { useRegisterContext } from "./context";

type SignUpProps = z.infer<typeof SignUpSchema>;

export const SignUpEmail = () => {
  const t = useExtracted();

  const { isMobile } = useMediaQuery();

  const { setStep, setEmail, setPassword, setName, email, name, lockEmail } =
    useRegisterContext();

  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<SignUpProps>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: {
      email: email ?? "",
      name: name ?? "",
      password: "",
    },
  });

  const currentEmail = form.watch("email");

  useEffect(() => {
    // Prefill the name field with the email address if it's not touched yet
    if (currentEmail && !form.getFieldState("name").isTouched) {
      form.setValue("name", currentEmail.split("@")[0] || "");
    }
  }, [currentEmail, form]);

  const onSubmit = async ({ email, password, name }: SignUpProps) => {
    startTransition(async () => {
      const response = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (!response.data && response.error) {
        toast.error(response.error.message);
        return;
      }

      setEmail(form.getValues("email"));
      setName(form.getValues("name"));
      setPassword(form.getValues("password"));
      setStep("verify");
    });
  };

  return (
    <form
      onSubmit={(e) => {
        if (
          form.getValues("email") &&
          !form.getValues("password") &&
          !showPassword
        ) {
          e.preventDefault();
          e.stopPropagation();
          // Prevent password error from being shown when user
          // clicked register button before entering an email
          form.clearErrors("name");
          form.clearErrors("password");
          setShowPassword(true);
          return;
        }

        void form.handleSubmit((values) => onSubmit(values))(e);
      }}
    >
      <FieldGroup>
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>{t("Email")}</FieldLabel>
              <Input
                id={field.name}
                aria-invalid={fieldState.invalid}
                type="email"
                placeholder="janic@virtbase.com"
                autoComplete="email"
                readOnly={!form.formState.errors.email && lockEmail}
                autoFocus={!isMobile && !showPassword && !lockEmail}
                {...field}
              />
            </Field>
          )}
        />
        {showPassword && (
          <>
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex flex-row items-center justify-between gap-2">
                    <FieldLabel htmlFor={field.name}>
                      {t("Display name")}
                    </FieldLabel>
                    <span className="flex font-normal text-muted-foreground text-sm">
                      <span className="flex w-5 justify-end">
                        {field.value?.length ?? 0}
                      </span>
                      <span>/32</span>
                    </span>
                  </div>
                  <Input
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    type="text"
                    placeholder="Walter White"
                    autoComplete="name"
                    autoFocus={!isMobile}
                    maxLength={32}
                    {...field}
                  />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("Password")}</FieldLabel>
                  <div className="flex flex-col">
                    <Input
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      type="password"
                      placeholder={t("Password")}
                      autoComplete="new-password"
                      {...field}
                    />
                    <PasswordRequirements
                      field={field}
                      invalid={fieldState.invalid}
                    />
                  </div>
                </Field>
              )}
            />
          </>
        )}
        <Button
          data-testid="sign-up-email-password-button"
          type="submit"
          disabled={isPending}
        >
          {isPending && <Spinner />}
          {t("Sign Up")}
        </Button>
      </FieldGroup>
    </form>
  );
};
