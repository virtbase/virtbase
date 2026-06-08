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
import { InputOTP, REGEXP_ONLY_DIGITS } from "@virtbase/ui/input-otp";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Separator } from "@virtbase/ui/separator";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth/client";
import { CopyButton } from "@/ui/copy-button";

export default function TwoFactorEnableDialog({
  totpUri,
  onConfirmed,
  ...props
}: Omit<
  React.ComponentProps<typeof ResponsiveDialog>,
  "title" | "description" | "footer"
> & { totpUri: string; onConfirmed: () => void }) {
  const t = useExtracted();

  const { isMobile } = useMediaQuery();

  const [code, setCode] = useState("");
  const [isInvalidCode, setIsInvalidCode] = useState(false);

  const [isPending, startTransition] = useTransition();

  const verifyCode = (code: string) =>
    startTransition(async () => {
      await authClient.twoFactor.verifyTotp({
        code,
        fetchOptions: {
          onSuccess: () => {
            setCode("");
            setIsInvalidCode(false);
            onConfirmed();
          },
          onError: () => {
            setCode("");
            setIsInvalidCode(true);
          },
        },
      });
    });

  const secret = new URL(totpUri).searchParams.get("secret") as string;
  const action = t("Set Up Authenticator App");

  return (
    <ResponsiveDialog
      title={action}
      description={action}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
            disabled={isPending}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => verifyCode(code)}
            disabled={isPending || !code || code.length < 6}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <div className="flex flex-col gap-4 overflow-hidden">
        <p className="text-balance text-center text-muted-foreground text-sm">
          {t(
            "Scan the QR code with your authenticator app. Enter the 6-digit code to finish setup, or copy the secret if you can't scan it.",
          )}
        </p>
        <div className="p-4">
          <div className="flex flex-row items-center justify-center gap-2">
            <p className="select-all break-all text-center font-mono text-sm">
              {secret}
            </p>
            <CopyButton value={secret} />
          </div>
          <div className="flex justify-center p-4">
            <div className="flex flex-initial flex-col items-stretch justify-start rounded-lg bg-foreground p-4">
              <div className="flex items-center justify-center">
                <QRCodeSVG
                  value={totpUri}
                  size={208}
                  level="M"
                  imageSettings={{
                    src: "/assets/static/bimi.svg",
                    height: 48,
                    width: 48,
                    excavate: true,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <Separator />
        <div>
          <InputOTP
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            autoFocus={!isMobile}
            value={code}
            onChange={(code) => {
              setIsInvalidCode(false);
              setCode(code);
            }}
            onComplete={(code) => {
              verifyCode(code);
            }}
            render={({ slots }) => (
              <div className="flex w-full items-center justify-center gap-2 py-4">
                {slots.map(({ char, isActive, hasFakeCaret }, idx) => (
                  <div
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
          />
          <AnimatedSizeContainer height>
            {isInvalidCode && (
              <p className="pt-3 text-center font-medium text-destructive text-xs">
                {t("Invalid code. Please try again.")}
              </p>
            )}
          </AnimatedSizeContainer>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
