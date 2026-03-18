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
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { APP_NAME, VIRTBASE_WORDMARK } from "@virtbase/utils";
import { createTranslator } from "use-intl/core";
import { Footer } from "../components/footer";
import { DEFAULT_EMAIL_LOCALE, getEmailTranslations } from "../translations";

export default function VerifyEmail({
  email = "janic@virtbase.com",
  code = "123456",
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  code: string;
  locale?: string | null;
}) {
  const t = createTranslator({
    messages: getEmailTranslations("verify-email", locale),
    locale: locale ?? DEFAULT_EMAIL_LOCALE,
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
            <Heading className="mx-0 my-7 p-0 font-medium text-black text-xl">
              {t("heading")}
            </Heading>
            <Text className="mx-auto text-sm leading-6">
              {t("instructions", { appName: APP_NAME })}
            </Text>
            <Section className="my-8 rounded-lg border border-neutral-200 border-solid">
              <div className="mx-auto w-fit px-6 py-3 text-center font-mono font-semibold text-2xl tracking-[0.25em]">
                {code}
              </div>
            </Section>
            <Text className="text-black text-sm leading-6">{t("hint")}</Text>
            <Footer email={email} locale={locale} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
