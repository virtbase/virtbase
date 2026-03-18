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

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@virtbase/ui/button";
import { Field, FieldGroup, FieldLabel } from "@virtbase/ui/field";
import { useMediaQuery } from "@virtbase/ui/hooks";
import { Input } from "@virtbase/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { Spinner } from "@virtbase/ui/spinner";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useExtracted, useLocale } from "next-intl";
import { useContext, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod/v4-mini";
import { LoginFormContext } from "@/features/auth/components/login-form";
import { PasskeyConditionalUI } from "@/features/auth/components/passkey-conditional-ui";
import { authClient } from "@/lib/auth/client";
import { useTRPC } from "@/lib/trpc/react";
import { ShowPasswordAddon } from "@/ui/input-group-addons";

export const EmailSignIn = ({ next }: { next?: string }) => {
  const t = useExtracted();
  const locale = useLocale();

  const router = useRouter();
  const searchParams = useSearchParams();
  const finalNext = next ?? searchParams?.get("next");
  const { isMobile } = useMediaQuery();

  const [showPassword, setShowPassword] = useState(false);

  const {
    showPasswordField,
    setShowPasswordField,
    setClickedMethod,
    authMethod,
    setAuthMethod,
    clickedMethod,
  } = useContext(LoginFormContext);

  const formSchema = z.object({
    email: z.email(),
    password: z.optional(z.string()),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const [email, password] = form.watch(["email", "password"]);

  const trpc = useTRPC();
  const { mutateAsync: executeAsync, isPending } = useMutation(
    trpc.auth.checkAccountExists.mutationOptions({
      onError: ({ message }) => {
        toast.error(message);
      },
    }),
  );

  const onSubmit = async ({ email }: z.infer<typeof formSchema>) => {
    // Check if the user can enter a password, and if so display the field
    if (!showPasswordField) {
      const result = await executeAsync({ email });

      const { accountExists, hasPassword } = result;

      if (accountExists && hasPassword) {
        setShowPasswordField(true);
        return;
      }

      if (!accountExists) {
        setClickedMethod(undefined);
        toast.error(t("No account found with that email address."));
        return;
      }

      setClickedMethod("email");
    }

    const result = await executeAsync({ email });

    const { accountExists, hasPassword } = result;

    if (!accountExists) {
      setClickedMethod(undefined);
      toast.error(t("No account found with that email address."));
      return;
    }

    const isPasswordLogin = password && hasPassword;

    let response:
      | Awaited<ReturnType<typeof authClient.signIn.email>>
      | Awaited<ReturnType<typeof authClient.signIn.magicLink>>
      | undefined;
    const callbackURL = finalNext || "/";
    if (isPasswordLogin) {
      response = await authClient.signIn.email({
        email,
        password: password as string,
        callbackURL,
        fetchOptions: {
          query: { locale },
        },
      });
    } else {
      response = await authClient.signIn.magicLink({
        email,
        callbackURL,
        fetchOptions: {
          query: { locale },
        },
      });
    }

    if (!response) {
      return;
    }

    if (!response.data && response.error) {
      toast.error(response.error.message);

      setClickedMethod(undefined);
      return;
    }

    if (!isPasswordLogin) {
      toast.success(t("Email sent - check your inbox!"));
      form.reset();
      setClickedMethod(undefined);
      return;
    }

    router.push(response?.url || callbackURL);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        {authMethod === "email" && (
          <>
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("Email")}</FieldLabel>
                  <Input
                    id={field.name}
                    data-testid="email-input"
                    aria-invalid={fieldState.invalid}
                    autoFocus={!isMobile && !showPasswordField}
                    placeholder="janic@virtbase.com"
                    // `webauthn` is required for PasskeyConditionalUI to work
                    autoComplete="email webauthn"
                    {...field}
                  />
                </Field>
              )}
            />
            <PasskeyConditionalUI />
          </>
        )}

        {showPasswordField && (
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor={field.name}>{t("Password")}</FieldLabel>
                  <NextLink
                    href={`/forgot-password?email=${encodeURIComponent(email)}`}
                    className="text-muted-foreground text-xs leading-none underline underline-offset-2 transition-colors hover:text-foreground"
                    prefetch={false}
                  >
                    {t("Forgot password?")}
                  </NextLink>
                </div>
                <InputGroup>
                  <InputGroupInput
                    id={field.name}
                    data-testid="password-input"
                    aria-invalid={fieldState.invalid}
                    autoFocus={!isMobile}
                    placeholder={t("Password (optional)")}
                    autoComplete="current-password"
                    type={showPassword ? "text" : "password"}
                    {...field}
                  />
                  <InputGroupAddon align="inline-end">
                    <ShowPasswordAddon
                      isPasswordVisible={showPassword}
                      setIsPasswordVisible={setShowPassword}
                      disabled={form.formState.disabled}
                    />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}
          />
        )}

        <Button
          {...(authMethod !== "email" && {
            type: "button",
            onClick: (e) => {
              e.preventDefault();
              setAuthMethod("email");
            },
          })}
          data-testid="sign-in-email-password-button"
          disabled={
            (clickedMethod && clickedMethod !== "email") ||
            clickedMethod === "email" ||
            isPending
          }
        >
          {clickedMethod === "email" || isPending ? (
            <Spinner />
          ) : password ? (
            t("Log in with password")
          ) : (
            t("Log in with email")
          )}
        </Button>
      </FieldGroup>
    </form>
  );
};
