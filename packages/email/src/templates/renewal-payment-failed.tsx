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
import { APP_DOMAIN, APP_NAME, VIRTBASE_WORDMARK } from "@virtbase/utils";
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
import { declineReasonKey } from "./decline-reason";

/**
 * The first contact of the dunning ladder: one charge has been refused and
 * four attempts remain.
 *
 * Its whole job is to turn a decline the customer cannot see into a minute of
 * work they can do. So it names the reason rather than saying "payment
 * failed", names the card so they know which one to fix, says when the next
 * attempt is so the deadline is real, and says the server is still running so
 * nobody panics and rebuilds somewhere else. The middle rungs of the ladder
 * send nothing; the next mail after this one is the final warning.
 */
export default async function RenewalPaymentFailed({
  email = "janic@virtbase.com",
  name = "Walter White",
  serverName = "vb1000",
  amount = 1299,
  currency = "EUR",
  failureCode = "insufficient_funds",
  nextAttemptAt = new Date(),
  cardBrand = "visa",
  cardLast4 = "4242",
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  name: string;
  serverName: string;
  /** In the smallest unit of `currency`, as the renewal stores it. */
  amount: number;
  currency: string;
  /** The provider's own code, stored raw on the renewal. */
  failureCode: string | null;
  nextAttemptAt: Date;
  cardBrand?: string | null;
  cardLast4?: string | null;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);
  const messages = getEmailMessages(resolvedLocale);

  const t = createTranslator({
    messages,
    locale: resolvedLocale,
    namespace: "renewal-payment-failed",
  });

  // A second namespace rather than a copy of the reasons in this one: the
  // final warning prints exactly the same sentences, and two copies of a
  // nine-way mapping are two copies to keep in step across four languages.
  const reason = createTranslator({
    messages,
    locale: resolvedLocale,
    namespace: "payment-decline-reason",
  });

  // UTC, matching `getEmailTitle`: the final warning's subject line is
  // formatted there and its body here, and a formatter left on the runtime's
  // zone would eventually print two different days for one deadline.
  const formatter = createFormatter({
    locale: resolvedLocale,
    timeZone: "UTC",
  });

  return (
    <Html>
      <Head />
      <Preview>{t("preview", { serverName })}</Preview>
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
              {t.rich("description", {
                serverName,
                amount: formatter.number(amount / 100, {
                  style: "currency",
                  currency,
                }),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </Text>
            <Text className="text-black text-sm leading-6">
              {reason(declineReasonKey(failureCode))}
              {cardBrand && cardLast4
                ? ` ${t("card", { brand: cardBrand, last4: cardLast4 })}`
                : ""}
            </Text>
            <Text className="text-black text-sm leading-6">
              {t.rich("nextAttempt", {
                date: formatter.dateTime(nextAttemptAt, { dateStyle: "long" }),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </Text>
            <Text className="text-black text-sm leading-6">
              {t.rich("reassurance", {
                serverName,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </Text>
            <Section className="my-8 mt-8">
              <Link
                className="rounded-lg bg-black px-6 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={`${APP_DOMAIN}/account/settings/billing`}
              >
                {t("updatePaymentButton")}
              </Link>
            </Section>
            <Footer email={email} locale={locale} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
