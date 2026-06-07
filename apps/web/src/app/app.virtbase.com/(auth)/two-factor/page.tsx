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

import {
  APP_DOMAIN,
  constructMetadata,
  constructOpengraphUrl,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { VerifyTotpForm } from "@/features/auth/components/verify-totp-form";
import { AuthLayout } from "@/ui/layout/auth-layout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  const title = t("Two-Factor Authentication");
  const description = t("Verify your two-factor authentication code.");

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${APP_DOMAIN}/two-factor`,
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      theme: "dark",
    }),
    noIndex: true,
  });
}

export default function Page() {
  const t = useExtracted();

  return (
    <AuthLayout>
      <main className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-center font-semibold text-xl">
            {t("Two-Factor Authentication")}
          </h1>
          <p className="font-medium text-base text-muted-foreground">
            {t("Enter the six digit code from your authenticator app.")}
          </p>
        </div>
        <div className="mt-8">
          <VerifyTotpForm />
        </div>
      </main>
    </AuthLayout>
  );
}
