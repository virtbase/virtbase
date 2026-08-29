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
import { APP_NAME, VIRTBASE_WORDMARK } from "@virtbase/utils";
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
 * The envelope every dispatched notification arrives in.
 *
 * One template rather than one per notification key, because the text is
 * already resolved by the time a channel sees it: the dispatcher renders
 * `title` and `body` for the recipient's locale, and each channel supplies
 * only its own markup. That is what keeps a new notification key from
 * needing an email template, a Discord embed and a webhook payload written
 * three times.
 *
 * `body` is plain text on purpose. It reaches here from renderers that may
 * interpolate reporter-supplied values, and React escapes it.
 */
export default async function NotificationEmail({
  email = "janic@virtbase.com",
  name = "Walter White",
  title = "Something happened",
  body = "Here is what happened, in one or two sentences.",
  url,
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  name?: string | null;
  title: string;
  body: string;
  url?: string;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);

  const t = createTranslator({
    messages: getEmailMessages(resolvedLocale),
    locale: resolvedLocale,
    namespace: "notification",
  });

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-neutral-200 border-solid px-10 py-5">
            <Section className="mt-8">
              <Img src={VIRTBASE_WORDMARK} height="32" alt={APP_NAME} />
            </Section>
            <Heading className="mx-0 my-7 p-0 font-medium text-black text-xl">
              {title}
            </Heading>
            {name ? (
              <Text className="text-black text-sm leading-6">
                {t("greeting", { name })}
              </Text>
            ) : null}
            <Text className="whitespace-pre-line text-black text-sm leading-6">
              {body}
            </Text>
            {url ? (
              <Section className="my-8 mt-8">
                <Link
                  className="rounded-lg bg-black px-6 py-3 text-center font-semibold text-[12px] text-white no-underline"
                  href={url}
                >
                  {t("viewButton")}
                </Link>
              </Section>
            ) : null}
            <Footer email={email} locale={locale} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
