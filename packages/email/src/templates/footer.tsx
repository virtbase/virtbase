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
  DEFAULT_EMAIL_LOCALE,
  getEmailMessages,
  resolveEmailLocale,
} from "@virtbase/email/translations";
import {
  APP_DOMAIN,
  PUBLIC_DOMAIN,
  TRUSTPILOT_REVIEW_URL,
} from "@virtbase/utils";
import { Hr, Link, Text } from "react-email";
import { createTranslator } from "use-intl/core";
import { Socials } from "./socials";

/**
 * Legal documents live in `packages/content/legal/<locale>/<slug>.mdx` and are
 * served at `/<locale>/legal/<slug>`. The prefix is explicit here because an
 * email knows the recipient's locale and should not depend on a cookie or
 * `Accept-Language` to land them on the right language.
 */
const LEGAL_SLUGS = ["notice", "terms", "privacy", "revocation"] as const;

export function Footer({
  email,
  marketing,
  unsubscribeUrl = `${APP_DOMAIN}/account/settings`,
  notificationSettingsUrl,
  showReview = false,
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  marketing?: boolean;
  unsubscribeUrl?: string;
  notificationSettingsUrl?: string;
  /**
   * Opt in to the Trustpilot review link. Off by default on purpose: a
   * forgotten opt-in is a missing call to action, while a forgotten opt-out
   * puts "rate us five stars" inside a password-reset or account-security
   * email, which reads as a phishing tell.
   */
  showReview?: boolean;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);

  const t = createTranslator({
    // Footer must remain synchronous (it is rendered as a JSX child), so we
    // use statically-imported messages instead of dynamic require/import.
    messages: getEmailMessages(resolvedLocale),
    locale: resolvedLocale,
    namespace: "footer",
  });

  return (
    <>
      <Hr className="mx-0 my-6 w-full border border-neutral-200" />
      <Text className="text-[12px] text-neutral-500 leading-6">
        {t.rich("thisEmailWasIntendedFor", {
          email,
          strong: (chunks) => <span className="text-black">{chunks}</span>,
        })}{" "}
        {t.rich("securityConcerns", {
          link: (chunks) => (
            <Link
              className="text-neutral-700 underline"
              href={`${PUBLIC_DOMAIN}/contact`}
            >
              {chunks}
            </Link>
          ),
        })}
      </Text>

      {(marketing || notificationSettingsUrl) && (
        <Text className="text-[12px] text-neutral-500 leading-6">
          {t("dontWantToGetTheseEmails")}{" "}
          <Link
            className="text-neutral-700 underline"
            href={marketing ? unsubscribeUrl : notificationSettingsUrl}
          >
            {marketing
              ? t("managePreferences")
              : t("adjustNotificationSettings")}
          </Link>
        </Text>
      )}
      {showReview && (
        <Text className="text-[12px] text-neutral-500 leading-6">
          {t.rich("howAreWeDoing", {
            link: (chunks) => (
              <Link
                className="text-neutral-700 underline"
                href={TRUSTPILOT_REVIEW_URL}
              >
                {chunks}
              </Link>
            ),
          })}
        </Text>
      )}

      <Text className="text-[12px] text-neutral-500 leading-6">
        {LEGAL_SLUGS.map((slug, index) => (
          <span key={slug}>
            {index > 0 && <span className="text-neutral-300"> &middot; </span>}
            <Link
              className="text-neutral-700 underline"
              href={`${PUBLIC_DOMAIN}/${resolvedLocale}/legal/${slug}`}
            >
              {t(`legal.${slug}`)}
            </Link>
          </span>
        ))}
      </Text>

      <Socials />

      <Text className="text-[12px] text-neutral-500">
        BeastHost UG (haftungsbeschränkt)
        <br />
        Lambarenestraße 21A, 09350 Lichtenstein/Sa.
        <br />
        {t("managingDirector")}: Janic Bellmann
        <br />
        {t("commercialRegister")}: Amtsgericht Chemnitz HRB 37032
      </Text>
    </>
  );
}
