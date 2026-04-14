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

import { Hr, Link, Text } from "@react-email/components";
import { APP_DOMAIN, PUBLIC_DOMAIN } from "@virtbase/utils";
import { createTranslator } from "use-intl/core";
import { DEFAULT_EMAIL_LOCALE, resolveEmailLocale } from "../translations";

export function Footer({
  email,
  marketing,
  unsubscribeUrl = `${APP_DOMAIN}/account/settings`,
  notificationSettingsUrl,
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  marketing?: boolean;
  unsubscribeUrl?: string;
  notificationSettingsUrl?: string;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);

  const t = createTranslator({
    // TODO: Using await import(...) causes issues with the build
    // Footer must remain synchronous for now
    messages: require(`../messages/${resolvedLocale}.json`),
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
