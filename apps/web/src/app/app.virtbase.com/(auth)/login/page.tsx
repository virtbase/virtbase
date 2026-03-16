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
import NextLink from "next/link";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { AuthLayout } from "@/ui/layout/auth-layout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  const title = t("Sign in to {appName}", { appName: APP_NAME });
  const description = t(
    "Sign in to your {appName} account to manage your virtual servers.",
    { appName: APP_NAME },
  );

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${APP_DOMAIN}/login`,
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
    <AuthLayout showTerms>
      <main className="w-full max-w-sm">
        <h1 className="text-center font-semibold text-xl">
          {t("Log in to your {appName} account", { appName: APP_NAME })}
        </h1>
        <div className="mt-8">{/* <LoginForm /> */}</div>
        <p className="mt-6 text-center font-medium text-muted-foreground text-sm">
          {t("Don't have an account?")}&nbsp;
          <NextLink
            href="/register"
            className="font-semibold text-foreground/80 transition-colors hover:text-foreground"
            prefetch={false}
          >
            {t("Sign up")}
          </NextLink>
        </p>
      </main>
    </AuthLayout>
  );
}
