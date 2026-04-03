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
import { APP_DOMAIN, APP_NAME, VIRTBASE_WORDMARK } from "@virtbase/utils";
import { createTranslator } from "use-intl/core";
import { Footer } from "../components/footer";
import { DEFAULT_EMAIL_LOCALE } from "../translations";

export default async function LoginLink({
  email = "janic@virtbase.com",
  url = `${APP_DOMAIN}/api/auth/callback/email?callbackUrl=${encodeURIComponent(APP_DOMAIN)}/login&token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&email=${encodeURIComponent(email)}`,
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  url: string;
  locale?: string | null;
}) {
  const t = createTranslator({
    messages: (await import(`../messages/${locale}.json`)).default,
    locale: locale ?? DEFAULT_EMAIL_LOCALE,
    namespace: "login-link",
  });

  return (
    <Html>
      <Head />
      <Preview>{t("preview", { appName: APP_NAME })}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-neutral-200 border-solid px-10 py-5">
            <Section className="mt-8">
              <Img src={VIRTBASE_WORDMARK} height="32" alt={APP_NAME} />
            </Section>
            <Heading className="mx-0 my-7 p-0 font-medium text-black text-lg">
              {t("heading")}
            </Heading>
            <Text className="text-black text-sm leading-6">
              {t("welcome", { appName: APP_NAME })}
            </Text>
            <Text className="text-black text-sm leading-6">
              {t("instructions")}
            </Text>
            <Section className="my-8">
              <Link
                className="rounded-lg bg-black px-6 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={url}
              >
                {t("signIn")}
              </Link>
            </Section>
            <Text className="text-black text-sm leading-6">
              {t("copyAndPaste")}
            </Text>
            <Text className="wrap-break-word max-w-sm flex-wrap font-medium text-purple-600 no-underline">
              {url.replace(/^https?:\/\//, "")}
            </Text>
            <Footer email={email} locale={locale} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
