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

import type { AbstractIntlMessages } from "use-intl";
import {
  messages as emailUpdatedMessages,
  titles as emailUpdatedTitles,
} from "./email-updated";
import { messages as footerMessages } from "./footer";
import {
  messages as invoiceCreatedMessages,
  titles as invoiceCreatedTitles,
} from "./invoice-created";
import {
  messages as loginLinkMessages,
  titles as loginLinkTitles,
} from "./login-link";
import {
  messages as passwordUpdatedMessages,
  titles as passwordUpdatedTitles,
} from "./password-updated";
import {
  messages as resetPasswordLinkMessages,
  titles as resetPasswordLinkTitles,
} from "./reset-password-link";
import {
  messages as serverReadyMessages,
  titles as serverReadyTitles,
} from "./server-ready";
import {
  messages as verifyEmailMessages,
  titles as verifyEmailTitles,
} from "./verify-email";

// TODO: Unify with the default locale in the web app (shared localization config and package)
export const EMAIL_LOCALES = ["en", "de", "fr", "nl"] as const;

export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const DEFAULT_EMAIL_LOCALE: EmailLocale = "en";

export type DefaultEmailLocale = typeof DEFAULT_EMAIL_LOCALE;

// Translations must at least have the default locale and can have additional locales
export type EmailTranslations = Record<
  DefaultEmailLocale,
  AbstractIntlMessages
> &
  Partial<Record<EmailLocale, AbstractIntlMessages>>;

export type EmailTitles = Record<DefaultEmailLocale, string> &
  Partial<Record<EmailLocale, string>>;

const messagesMapping = {
  "email-updated": emailUpdatedMessages,
  "login-link": loginLinkMessages,
  "reset-password-link": resetPasswordLinkMessages,
  "password-updated": passwordUpdatedMessages,
  "verify-email": verifyEmailMessages,
  "invoice-created": invoiceCreatedMessages,
  "server-ready": serverReadyMessages,
  // Components
  footer: footerMessages,
} as const;

type MessagesMapping = typeof messagesMapping;
type MessagesKey = keyof typeof messagesMapping;

const titlesMapping = {
  "email-updated": emailUpdatedTitles,
  "login-link": loginLinkTitles,
  "reset-password-link": resetPasswordLinkTitles,
  "verify-email": verifyEmailTitles,
  "password-updated": passwordUpdatedTitles,
  "invoice-created": invoiceCreatedTitles,
  "server-ready": serverReadyTitles,
} as const;

type TitlesMapping = typeof titlesMapping;
type TitlesKey = keyof typeof titlesMapping;

export function getEmailTranslations<T extends MessagesKey>(
  key: T,
  locale: string | null = DEFAULT_EMAIL_LOCALE,
) {
  const messages = messagesMapping[key];
  // @ts-expect-error Let's not deal with this for now
  return (messages[locale] ??
    // @ts-expect-error Let's not deal with this for now
    messages[DEFAULT_EMAIL_LOCALE]) as MessagesMapping[T][DefaultEmailLocale];
}

export function getEmailTitle<T extends TitlesKey>(
  key: T,
  locale: string | null = DEFAULT_EMAIL_LOCALE,
) {
  const titles = titlesMapping[key];
  // @ts-expect-error Let's not deal with this for now
  return (titles[locale] ??
    // @ts-expect-error Let's not deal with this for now
    titles[DEFAULT_EMAIL_LOCALE]) as TitlesMapping[T][DefaultEmailLocale];
}
