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
import { createFormatter, createTranslator } from "use-intl/core";
import deMessages from "../messages/de.json";
import enMessages from "../messages/en.json";
import frMessages from "../messages/fr.json";
import nlMessages from "../messages/nl.json";

// TODO: Unify with the default locale in the web app (shared localization config and package)
export const EMAIL_LOCALES = ["en", "de", "fr", "nl"] as const;
export const DEFAULT_EMAIL_LOCALE = "en" as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

const EMAIL_MESSAGES: Record<EmailLocale, typeof enMessages> = {
  en: enMessages,
  de: deMessages,
  fr: frMessages,
  nl: nlMessages,
};

export function resolveEmailLocale(locale?: string | null): EmailLocale {
  return hasLocale(EMAIL_LOCALES, locale) ? locale : DEFAULT_EMAIL_LOCALE;
}

/**
 * Synchronously resolves email messages for a locale using static imports.
 * Use this when a component must remain synchronous (e.g. rendered as a JSX
 * child) and cannot `await import(...)`.
 */
export function getEmailMessages(locale?: string | null) {
  return EMAIL_MESSAGES[resolveEmailLocale(locale)];
}

export type EmailTitleKey =
  | "account-deleted"
  | "account-deletion-cancelled"
  | "account-deletion-requested"
  | "account-deletion-scheduled"
  | "account-inactivity-notice"
  | "account-inactivity-reminder"
  | "confirm-identity"
  | "data-export-ready"
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
  | "verify-email"
  | "verify-email-link";

/**
 * Subjects that name the deletion date. `appName` is filled in for every
 * title, but a date is only known to the caller, and use-intl answers an
 * unmet placeholder with the message key rather than an error - so leaving
 * one out ships `account-deletion-scheduled.title` as the subject line.
 * Splitting these out is what makes the compiler ask for it.
 */
export type EmailTitleKeyWithDate =
  | "account-deletion-scheduled"
  | "account-inactivity-reminder";

export async function getEmailTitle(
  key: EmailTitleKeyWithDate,
  locale: string | null | undefined,
  values: { date: Date },
): Promise<string>;
export async function getEmailTitle(
  key: Exclude<EmailTitleKey, EmailTitleKeyWithDate>,
  locale?: string | null,
): Promise<string>;
export async function getEmailTitle(
  key: EmailTitleKey,
  locale: string | null = DEFAULT_EMAIL_LOCALE,
  values?: { date: Date },
) {
  const candidate = resolveEmailLocale(locale);

  const t = createTranslator({
    messages: getEmailMessages(candidate),
    locale: candidate,
    namespace: key,
  });

  // Same formatting as the body of the mail the subject belongs to, so the
  // date does not change shape between the two.
  const formatter = createFormatter({ locale: candidate, timeZone: "UTC" });

  return t("title", {
    appName: APP_NAME,
    ...(values && {
      date: formatter.dateTime(values.date, { dateStyle: "long" }),
    }),
  });
}
