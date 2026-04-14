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

import { APP_NAME } from "@virtbase/utils";
import { hasLocale } from "use-intl";
import { createTranslator } from "use-intl/core";

// TODO: Unify with the default locale in the web app (shared localization config and package)
export const EMAIL_LOCALES = ["en", "de", "fr", "nl"] as const;
export const DEFAULT_EMAIL_LOCALE = "en" as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export function resolveEmailLocale(locale?: string | null): EmailLocale {
  return hasLocale(EMAIL_LOCALES, locale) ? locale : DEFAULT_EMAIL_LOCALE;
}

export async function getEmailTitle(
  key:
    | "email-updated"
    | "invoice-created"
    | "login-link"
    | "password-updated"
    | "reset-password-link"
    | "server-deleted"
    | "server-extended"
    | "server-ready"
    | "server-renewal-reminder"
    | "server-suspended"
    | "verify-email",
  locale: string | null = DEFAULT_EMAIL_LOCALE,
) {
  const candidate = resolveEmailLocale(locale);

  const messages = (await import(`../messages/${candidate}.json`)).default;
  const t = createTranslator({
    messages,
    locale: candidate,
    namespace: key,
  });

  return t("title", { appName: APP_NAME });
}
