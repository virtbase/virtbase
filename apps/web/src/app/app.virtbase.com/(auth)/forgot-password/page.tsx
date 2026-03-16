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
  APP_NAME,
  constructMetadata,
  constructOpengraphUrl,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { AuthLayout } from "@/ui/layout/auth-layout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  const title = t("Forgot password for {appName}", { appName: APP_NAME });
  const description = t("Reset the password of your {appName} account.", {
    appName: APP_NAME,
  });

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${APP_DOMAIN}/forgot-password`,
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      theme: "dark",
    }),
  });
}

export default function Page() {
  const t = useExtracted();

  return (
    <AuthLayout>
      <main className="w-full max-w-sm">
        <h1 className="text-center font-semibold text-xl">
          {t("Reset your password")}
        </h1>
        <div className="mt-8">{/* <ForgotPasswordForm /> */}</div>
      </main>
    </AuthLayout>
  );
}
