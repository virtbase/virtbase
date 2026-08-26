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
  ACCOUNT_INACTIVITY_MONTHS,
  APP_DOMAIN,
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
import { createFormatter, createTranslator } from "use-intl/core";

/**
 * Notice that a dormant account is about to go.
 *
 * The instruction is deliberately the smallest possible one: sign in. Anything
 * that asks an inactive customer to find a button in a settings page is a
 * notice half of them will not act on.
 */
export default async function InactivityEmail({
  email = "janic@virtbase.com",
  name = "Walter White",
  scheduledAt = new Date(),
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  name: string;
  scheduledAt: Date;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);
  const t = createTranslator({
    messages: getEmailMessages(resolvedLocale),
    locale: resolvedLocale,
    namespace: "account-inactivity-notice",
  });
  const formatter = createFormatter({
    locale: resolvedLocale,
    timeZone: "UTC",
  });

  const date = formatter.dateTime(scheduledAt, { dateStyle: "long" });

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
              {t("instructions", {
                appName: APP_NAME,
                months: `${ACCOUNT_INACTIVITY_MONTHS}`,
                date,
              })}
            </Text>
            <Text className="font-medium text-black text-sm leading-6">
              {t("stop")}
            </Text>
            <Section className="my-8">
              <Link
                className="rounded-lg bg-black px-6 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={`${APP_DOMAIN}/login`}
              >
                {t("cta")}
              </Link>
            </Section>
            <Text className="text-neutral-500 text-sm leading-6">
              {t("download")}
            </Text>
            <Footer email={email} locale={locale} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
