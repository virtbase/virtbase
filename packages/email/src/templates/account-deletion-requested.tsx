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

import { Footer } from "@virtbase/email/templates/footer";
import {
  DEFAULT_EMAIL_LOCALE,
  getEmailMessages,
  resolveEmailLocale,
} from "@virtbase/email/translations";
import {
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS,
  ACCOUNT_DELETION_TOKEN_TTL_HOURS,
  APP_NAME,
  VIRTBASE_WORDMARK,
} from "@virtbase/utils";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";
import { createTranslator } from "use-intl/core";

/**
 * The link that turns a request into a scheduled deletion.
 *
 * Carries the "if this was not you" line prominently, because this is the one
 * message that reaches the real owner of a hijacked account before anything is
 * destroyed.
 */
export default async function AccountDeletionRequested({
  email = "janic@virtbase.com",
  name = "Walter White",
  url = "https://app.virtbase.com/api/privacy/confirm-deletion?token=123",
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  name: string;
  url: string;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);
  const t = createTranslator({
    messages: getEmailMessages(resolvedLocale),
    locale: resolvedLocale,
    namespace: "account-deletion-requested",
  });

  return (
    <Html>
      <Head />
      <Preview>{t("preview")}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-neutral-200 border-solid px-10 py-5">
            <Section className="mt-8">
              <Img src={VIRTBASE_WORDMARK} height="32" alt={APP_NAME} />
            </Section>
            <Heading className="mx-0 my-7 p-0 font-medium text-black text-xl">
              {t("heading")}
            </Heading>
            <Text className="text-black text-sm leading-6">
              {t("greeting", { name })}
            </Text>
            <Text className="mx-auto text-sm leading-6">
              {t("instructions", { appName: APP_NAME })}
            </Text>
            <Section className="my-8">
              <Link
                className="rounded-lg bg-black px-6 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={url}
              >
                {t("confirm")}
              </Link>
            </Section>
            <Text className="text-black text-sm leading-6">
              {t("consequences", {
                days: `${ACCOUNT_DELETION_GRACE_PERIOD_DAYS}`,
              })}
            </Text>
            <Text className="font-medium text-black text-sm leading-6">
              {t("ignore")}
            </Text>
            <Text className="text-neutral-500 text-sm leading-6">
              {t("expiry", { hours: `${ACCOUNT_DELETION_TOKEN_TTL_HOURS}` })}
            </Text>
            <Footer email={email} locale={locale} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
