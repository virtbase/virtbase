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
import { useMediaQuery } from "@virtbase/ui/hooks";
import { InputOTP } from "@virtbase/ui/input-otp";
import { Spinner } from "@virtbase/ui/spinner";
import { useRouter, useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { useRegisterContext } from "./context";
import { ResendOtp } from "./resend-otp";

export const VerifyEmailForm = ({ next }: { next?: string }) => {
  const t = useExtracted();

  const router = useRouter();
  const searchParams = useSearchParams();
  const finalNext = next ?? searchParams?.get("next");

  const { isMobile } = useMediaQuery();
  const [code, setCode] = useState("");
  const { email, password } = useRegisterContext();
  const [isInvalidCode, setIsInvalidCode] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSubmit = async ({ email, code }: { email: string; code: string }) =>
    startTransition(async () => {
      const response = await authClient.emailOtp.verifyEmail({
        email,
        otp: code,
      });

      if (!response.data && response.error) {
        toast.error(response.error.message);
        setCode("");
        setIsInvalidCode(true);
        return;
      }

      toast.success(t("Account created! Redirecting..."));
      setIsRedirecting(true);

      router.push(finalNext || "/");
    });

  if (!email || !password) {
    router.push("/register");
    return;
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ email, code });
        }}
      >
        <div>
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(code) => {
              setIsInvalidCode(false);
              setCode(code);
            }}
            autoFocus={!isMobile}
            render={({ slots }) => (
              <div className="flex w-full items-center justify-between">
                {slots.map(({ char, isActive, hasFakeCaret }, idx) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: idx is unique
                    key={idx}
                    className={cn(
                      "relative flex h-14 w-12 items-center justify-center text-xl",
                      "rounded-lg border border-border bg-background ring-0 transition-all",
                      isActive && "z-10 border border-ring ring-2 ring-ring/50",
                      isInvalidCode && "border-destructive ring-destructive/20",
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
            onComplete={() => {
              void onSubmit({ email, code });
            }}
          />
          <AnimatedSizeContainer height>
            {isInvalidCode && (
              <p className="pt-3 text-center font-medium text-red-500 text-xs">
                {t("Invalid code. Please try again.")}
              </p>
            )}
          </AnimatedSizeContainer>

          <Button
            className="mt-8 w-full"
            type="submit"
            disabled={!code || code.length < 6 || isPending || isRedirecting}
          >
            {isPending || (isRedirecting && <Spinner />)}
            {t("Continue")}
          </Button>
        </div>
      </form>

      <ResendOtp email={email} />
    </div>
  );
};
