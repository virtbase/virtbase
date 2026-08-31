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
  APP_DOMAIN,
  APP_NAME,
  DATA_EXPORT_TTL_DAYS,
  formatBytes,
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
 * Tells a customer their export is downloadable.
 *
 * Carries the link and nothing else. The passphrase that opens the file was
 * shown in the browser session that requested the export and is deliberately
 * absent here - putting both in one message would make the encryption
 * pointless the moment a mailbox is compromised.
 */
export default async function DataExportReady({
  email = "janic@virtbase.com",
  name = "Walter White",
  exportId = "exp_0000000000000000000000000",
  byteSize = 2_400_000,
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  name: string;
  exportId: string;
  byteSize: number;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);

  const t = createTranslator({
    messages: getEmailMessages(resolvedLocale),
    locale: resolvedLocale,
    namespace: "data-export-ready",
  });

  const formatter = createFormatter({
    locale: resolvedLocale,
  });

  const url = `${APP_DOMAIN}/account/settings/privacy?export=${exportId}`;

  return (
    <Html>
      <Head />
      <Preview>{t("preview")}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-150 rounded border border-neutral-200 border-solid px-10 py-5">
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
                size: formatBytes(byteSize, { formatter }),
              })}
            </Text>
            <Section className="my-8">
              <Link
                className="rounded-lg bg-black px-6 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={url}
              >
                {t("download")}
              </Link>
            </Section>
            <Text className="text-black text-sm leading-6">
              {t("passphrase")}
            </Text>
            <Text className="text-neutral-500 text-sm leading-6">
              {t("expiry", { days: `${DATA_EXPORT_TTL_DAYS}` })}
            </Text>
            <Footer email={email} locale={locale} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
