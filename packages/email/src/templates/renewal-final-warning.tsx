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
  SERVER_DELETION_GRACE_PERIOD_DAYS,
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
import { declineReasonKey } from "./decline-reason";

/**
 * The last contact before the server goes off, and the one that has to
 * convert.
 *
 * Two dates carry it, and both are read off the same constants the sweeps act
 * on rather than described in prose: the day the machine is suspended, and how
 * long the disk survives after that. A customer who knows only "your payment
 * failed" postpones; one who knows the date their data is deleted does not.
 *
 * `lastAttemptAt` is null for a decline the provider says can never come good.
 * There is no further attempt to promise in that case, and promising one would
 * make the mail ignorable: the whole point is that nothing else will happen
 * unless the customer acts.
 */
export default async function RenewalFinalWarning({
  email = "janic@virtbase.com",
  name = "Walter White",
  serverName = "vb1000",
  amount = 1299,
  currency = "EUR",
  failureCode = "expired_card",
  lastAttemptAt = new Date(),
  suspendsAt = new Date(),
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
  /** The final scheduled retry, or null when the ladder has been struck off. */
  lastAttemptAt: Date | null;
  suspendsAt: Date;
  cardBrand?: string | null;
  cardLast4?: string | null;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);
  const messages = getEmailMessages(resolvedLocale);

  const t = createTranslator({
    messages,
    locale: resolvedLocale,
    namespace: "renewal-final-warning",
  });

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
              {lastAttemptAt
                ? t.rich("lastAttempt", {
                    date: formatter.dateTime(lastAttemptAt, {
                      dateStyle: "long",
                    }),
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })
                : t.rich("noFurtherAttempt", {
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
            </Text>
            <Text className="text-black text-sm leading-6">
              {t.rich("deadline", {
                serverName,
                date: formatter.dateTime(suspendsAt, { dateStyle: "long" }),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </Text>
            <Text className="text-black text-sm leading-6">
              {t.rich("retention", {
                days: `${SERVER_DELETION_GRACE_PERIOD_DAYS}`,
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
