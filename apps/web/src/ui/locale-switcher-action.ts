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

"use server";

import { captureException } from "@sentry/nextjs";
import { COOKIE_DOMAIN } from "@virtbase/utils";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { hasLocale } from "next-intl";
import { cache } from "react";
import { COOKIE_NAME, locales } from "@/i18n/config";
import { auth } from "@/lib/auth/server";

export async function updateLocaleAction(data: FormData) {
  const locale = data.get("locale");
  if ("string" !== typeof locale || !hasLocale(locales, locale)) {
    return;
  }

  const store = await cookies();
  store.set(COOKIE_NAME, locale, {
    domain: COOKIE_DOMAIN,
  });

  after(() => updateDatabaseLocale(locale));

  revalidatePath("/app.virtbase.com");
  revalidatePath("/admin.virtbase.com");
}

const updateDatabaseLocale = cache(async (locale: string) => {
  try {
    await auth.api.updateUser({
      headers: await headers(),
      body: { locale },
    });
  } catch (error) {
    captureException(error);
  }
});
