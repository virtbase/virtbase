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
} from "@react-email/components";
import {
  APP_DOMAIN,
  APP_NAME,
  SERVER_DELETION_GRACE_PERIOD_DAYS,
  VIRTBASE_WORDMARK,
} from "@virtbase/utils";
import { createTranslator } from "use-intl/core";
import { Footer } from "../components/footer";
import { DEFAULT_EMAIL_LOCALE } from "../translations";

export default async function ServerRenewalReminder({
  email = "janic@virtbase.com",
  name = "Walter White",
  serverName = "vb1000",
  serverId = "1234567890",
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  name: string;
  serverName: string;
  serverId: string;
  locale?: string | null;
}) {
  const t = createTranslator({
    messages: (await import(`../messages/${locale}.json`)).default,
    locale: locale ?? DEFAULT_EMAIL_LOCALE,
    namespace: "server-renewal-reminder",
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
              {t.rich("description", {
                serverName,
                days: `${SERVER_DELETION_GRACE_PERIOD_DAYS}`,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </Text>
            <Text className="text-black text-sm leading-6">
              {t.rich("hint", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </Text>
            <Section className="my-8 mt-8">
              <Link
                className="rounded-lg bg-black px-6 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={`${APP_DOMAIN}/servers/${serverId}/plan`}
              >
                {t("renewButton")}
              </Link>
            </Section>
            <Footer email={email} locale={locale} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
