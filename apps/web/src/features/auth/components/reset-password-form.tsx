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
import { Field, FieldError, FieldGroup, FieldLabel } from "@virtbase/ui/field";
import { useMediaQuery } from "@virtbase/ui/hooks";
import { Input } from "@virtbase/ui/input";
import { Spinner } from "@virtbase/ui/spinner";
import { ResetPasswordSchema } from "@virtbase/validators/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type z4 from "zod/v4";
import { PasswordRequirements } from "@/features/auth/components/password-requirements";
import { authClient } from "@/lib/auth/client";

export const ResetPasswordForm = () => {
  const t = useExtracted();

  const { isMobile } = useMediaQuery();

  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [token, router]);

  const form = useForm<z4.infer<typeof ResetPasswordSchema>>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: {
      token: token ?? "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async ({
    token,
    password,
  }: z4.infer<typeof ResetPasswordSchema>) => {
    if (!token) {
      router.replace("/login");
      return;
    }

    const response = await authClient.resetPassword({
      token,
      newPassword: password,
    });

    if (!response.data || response.error) {
      toast.error(response.error.message);
      return;
    }

    toast.success(
      t(
        "Your password has been reset. You can now log in with your new password.",
      ),
    );
    router.replace("/login");
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>{t("Password")}</FieldLabel>
              <Input
                data-testid="password-input"
                type="password"
                id={field.name}
                aria-invalid={fieldState.invalid}
                autoComplete="new-password"
                autoFocus={!isMobile}
                {...field}
              />
              <PasswordRequirements
                field={field}
                invalid={fieldState.invalid}
              />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>
                {t("Confirm password")}
              </FieldLabel>
              <Input
                data-testid="confirm-password-input"
                type="password"
                id={field.name}
                aria-invalid={fieldState.invalid}
                autoComplete="new-password"
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Button
          data-testid="reset-password-button"
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? <Spinner /> : t("Reset Password")}
        </Button>
      </FieldGroup>
    </form>
  );
};
