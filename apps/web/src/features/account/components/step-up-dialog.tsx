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

import { cn } from "@virtbase/ui";
import { AnimatedSizeContainer } from "@virtbase/ui/animated-size-container";
import { Button } from "@virtbase/ui/button";
import { Field, FieldLabel } from "@virtbase/ui/field";
import { useMediaQuery } from "@virtbase/ui/hooks";
import { LucideKey, LucideLock, LucideMail } from "@virtbase/ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { InputOTP, REGEXP_ONLY_DIGITS } from "@virtbase/ui/input-otp";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Skeleton } from "@virtbase/ui/skeleton";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  useStepUpStatus,
  useVerifyStepUpPassword,
} from "@/features/account/hooks/privacy/step-up";
import { authClient } from "@/lib/auth/client";
import { ShowPasswordAddon } from "@/ui/input-group-addons/show-password-addon";

type Method = "password" | "passkey" | "emailOtp";

/**
 * One way to prove who you are.
 *
 * Visually the security page's factor rows, rebuilt for a dialog rather than
 * reusing `ItemRow`: that component collapses its borders with `-m-px` so it
 * can stack inside a card, and a negative margin inside the
 * `AnimatedSizeContainer` here - which clips - shaves the border off.
 */
function MethodRow({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b p-4 last:border-b-0">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-medium text-sm">{title}</p>
        <p className="truncate text-muted-foreground text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Asks the customer to prove who they are before something irreversible.
 *
 * Offers each route as a row, the way the security page lists factors, and
 * only the ones this account can actually take - a customer who has only ever
 * signed in with Discord has no password to type, and showing them the field
 * is a dead end rather than a challenge.
 *
 * Passkey and email code work by signing in again, which mints a session young
 * enough to satisfy the check on its own. Only the password route calls our
 * own endpoint, because verifying a password mints nothing.
 */
export function StepUpDialog({
  onSatisfied,
  ...props
}: Omit<
  React.ComponentProps<typeof ResponsiveDialog>,
  "title" | "description" | "footer"
> & {
  onSatisfied: () => void | Promise<void>;
}) {
  const t = useExtracted();
  const { isMobile } = useMediaQuery();

  const { data: status, isPending: isLoadingMethods } = useStepUpStatus();
  const verifyPassword = useVerifyStepUpPassword();

  const [method, setMethod] = useState<Method | null>(null);
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [code, setCode] = useState("");
  const [isInvalidCode, setIsInvalidCode] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Never leave a typed password or a live code behind in component state.
  useEffect(() => {
    if (!props.open) {
      setMethod(null);
      setPassword("");
      setIsPasswordVisible(false);
      setCode("");
      setIsInvalidCode(false);
    }
  }, [props.open]);

  const methods = status?.methods;

  const submitPassword = () =>
    startTransition(async () => {
      try {
        await verifyPassword.mutateAsync({ password });
        await onSatisfied();
      } catch {
        setPassword("");
        toast.error(t("That password is not correct."));
      }
    });

  const submitPasskey = () =>
    startTransition(async () => {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        toast.error(t("We could not verify your passkey."));
        return;
      }
      await onSatisfied();
    });

  const sendCode = () =>
    startTransition(async () => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: status?.email ?? "",
        type: "sign-in",
      });
      if (error) {
        toast.error(t("We could not send the code. Please try again."));
        return;
      }
      setMethod("emailOtp");
      toast.success(t("We sent a code to your email address."));
    });

  const submitCode = (otp: string) =>
    startTransition(async () => {
      const { error } = await authClient.signIn.emailOtp({
        email: status?.email ?? "",
        otp,
      });
      if (error) {
        setCode("");
        setIsInvalidCode(true);
        return;
      }
      await onSatisfied();
    });

  return (
    <ResponsiveDialog
      title={t("Confirm It's You")}
      description={t("Confirm It's You")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              method ? setMethod(null) : props.onOpenChange?.(false)
            }
            disabled={isPending}
          >
            {method ? t("Back") : t("Cancel")}
          </Button>
          {/*
           * Only the password route needs one. The other two submit
           * themselves - a passkey on the prompt, a code on its sixth digit -
           * and a button that is never the thing you press is clutter.
           */}
          {method === "password" && (
            <Button
              type="button"
              onClick={submitPassword}
              disabled={isPending || !password}
            >
              {isPending && <Spinner />}
              {t("Confirm")}
            </Button>
          )}
        </>
      }
      {...props}
    >
      <AnimatedSizeContainer height>
        <div className="flex flex-col gap-4">
          <p className="text-balance text-center text-muted-foreground text-sm">
            {method === "password"
              ? t("Enter your password to continue.")
              : method === "emailOtp"
                ? t("Enter the 6-digit code we sent to your email address.")
                : t(
                    "This step cannot be undone, so we need to check it is really you.",
                  )}
          </p>

          {isLoadingMethods && <Skeleton className="h-20 w-full" />}

          {!isLoadingMethods && method === null && (
            <div className="overflow-hidden rounded-md border">
              {methods?.password && (
                <MethodRow
                  icon={<LucideLock className="size-5" />}
                  title={t("Password")}
                  description={t("The password you sign in with.")}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMethod("password")}
                    >
                      {t("Use")}
                    </Button>
                  }
                />
              )}

              {methods?.passkey && (
                <MethodRow
                  icon={<LucideKey className="size-5" />}
                  title={t("Passkey")}
                  description={t("Your fingerprint, face, or security key.")}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={submitPasskey}
                      disabled={isPending}
                    >
                      {isPending ? <Spinner /> : t("Use")}
                    </Button>
                  }
                />
              )}

              {methods?.emailOtp && (
                <MethodRow
                  icon={<LucideMail className="size-5" />}
                  title={t("Email Code")}
                  description={status?.email ?? ""}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={sendCode}
                      disabled={isPending}
                    >
                      {isPending ? <Spinner /> : t("Send")}
                    </Button>
                  }
                />
              )}
            </div>
          )}

          {method === "password" && (
            <Field>
              <FieldLabel htmlFor="step-up-password">
                {t("Password")}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="step-up-password"
                  type={isPasswordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus={!isMobile}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && password) submitPassword();
                  }}
                  disabled={isPending}
                />
                <InputGroupAddon align="inline-end">
                  <ShowPasswordAddon
                    isPasswordVisible={isPasswordVisible}
                    setIsPasswordVisible={setIsPasswordVisible}
                  />
                </InputGroupAddon>
              </InputGroup>
            </Field>
          )}

          {method === "emailOtp" && (
            <div className="flex flex-col items-center gap-4">
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                autoFocus={!isMobile}
                value={code}
                onChange={(value) => {
                  setIsInvalidCode(false);
                  setCode(value);
                }}
                // Six digits is the whole input; making them press a button
                // afterwards is a step with nothing in it.
                onComplete={(value) => submitCode(value)}
                render={({ slots }) => (
                  <div className="flex w-full items-center justify-center gap-2 py-4">
                    {slots.map(({ char, isActive, hasFakeCaret }, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "relative flex h-14 w-12 items-center justify-center text-xl",
                          "rounded-lg border border-border bg-background ring-0 transition-all",
                          isActive &&
                            "z-10 border border-ring ring-2 ring-ring/50",
                          isInvalidCode &&
                            "border-destructive ring-destructive/20",
                        )}
                      >
                        {char}
                        {hasFakeCaret && (
                          <div className="pointer-events-none absolute inset-0 flex animate-caret-blink items-center justify-center">
                            <div className="h-5 w-px bg-foreground" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              />
              {isPending && <Spinner />}
              <AnimatedSizeContainer height>
                {isInvalidCode && (
                  <p className="pt-1 text-center font-medium text-destructive text-xs">
                    {t("Invalid code. Please try again.")}
                  </p>
                )}
              </AnimatedSizeContainer>
            </div>
          )}
        </div>
      </AnimatedSizeContainer>
    </ResponsiveDialog>
  );
}
