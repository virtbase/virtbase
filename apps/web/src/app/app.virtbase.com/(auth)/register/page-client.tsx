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

import { APP_NAME, truncate } from "@virtbase/utils";
import NextLink from "next/link";
import { useExtracted } from "next-intl";
import {
  RegisterProvider,
  useRegisterContext,
} from "@/features/auth/components/register/context";
import { SignUpForm } from "@/features/auth/components/register/signup-form";
import { VerifyEmailForm } from "@/features/auth/components/register/verify-email-form";

export default function RegisterPageClient() {
  return (
    <RegisterProvider>
      <RegisterFlow />
    </RegisterProvider>
  );
}

function SignUp() {
  const t = useExtracted();

  return (
    <main className="w-full max-w-sm">
      <h1 className="text-center font-semibold text-xl">
        {t("Create your {appName} account", { appName: APP_NAME })}
      </h1>
      <div className="mt-8">
        <SignUpForm />
      </div>
      <p className="mt-6 text-center font-medium text-muted-foreground text-sm">
        {t("Already have an account?")}&nbsp;
        <NextLink
          href="/login"
          className="font-semibold text-foreground/80 transition-colors hover:text-foreground"
        >
          {t("Log in")}
        </NextLink>
      </p>
    </main>
  );
}

function Verify() {
  const t = useExtracted();

  const { email } = useRegisterContext();

  return (
    <main className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-center font-semibold text-xl">
          {t("Verify your email address")}
        </h3>
        <p className="font-medium text-base text-muted-foreground">
          {t.rich(
            "Enter the six digit verification code sent to <strong>{email}</strong>",
            {
              strong: (chunks) => (
                <strong className="font-semibold text-foreground">
                  {chunks}
                </strong>
              ),
              email: truncate(email, 30) ?? "",
            },
          )}
        </p>
      </div>
      <div className="mt-12">
        <VerifyEmailForm />
      </div>
    </main>
  );
}

const RegisterFlow = () => {
  const { step } = useRegisterContext();

  if (step === "signup") return <SignUp />;
  if (step === "verify") return <Verify />;
};
