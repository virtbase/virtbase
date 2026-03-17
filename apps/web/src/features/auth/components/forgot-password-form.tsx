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
import { useRouter, useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod/v4-mini";
import { authClient } from "@/lib/auth/client";

export const ForgotPasswordForm = () => {
  const t = useExtracted();

  const router = useRouter();

  const { isMobile } = useMediaQuery();
  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();
  const executeAsync = async ({ email }: { email: string }) =>
    startTransition(async () => {
      const response = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
      if (response.data && !response.error) {
        toast.success(
          t(
            "You will receive an email with instructions to reset your password.",
          ),
        );
        router.push("/login");
      } else {
        toast.error(response.error.message);
      }
    });

  const formSchema = z.object({
    email: z.email(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: searchParams.get("email") || "",
    },
  });

  const onSubmit = async ({ email }: { email: string }) => {
    await executeAsync({ email });
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <form onSubmit={form.handleSubmit(onSubmit)}>
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
                  autoFocus={!isMobile}
                  placeholder="janic@virtbase.com"
                  autoComplete="email"
                  {...field}
                />
              </Field>
            )}
          />
          <Button
            data-testid="forgot-password-button"
            type="submit"
            className="w-full"
            disabled={isPending || !form.formState.isValid}
          >
            {isPending ? <Spinner /> : t("Send reset link")}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
};
