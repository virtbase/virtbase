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
import { createTranslator } from "use-intl/core";
import { declineReasonKey } from "./decline-reason";

/**
 * A credential rather than a charge: the provider has told us this payment
 * method is dead, and every renewal that names it will fail until it is
 * replaced.
 *
 * Deliberately says nothing about one server or one invoice. A card backs
 * every subscription a customer has, so this is the notice that is worth
 * sending the moment `payment_methods.invalid_at` is set - **before** a
 * renewal is due, when there is still nothing to fix but the card itself. It
 * is the only mail in the set that a customer can act on with no deadline
 * hanging over them, which is exactly why it is the cheapest one to send.
 *
 * The wording holds whether or not a charge has already been refused, because
 * both are real: the card can be marked dead by a decline, and it can be
 * marked dead by the provider telling us so out of band.
 */
export default async function PaymentMethodInvalid({
  email = "janic@virtbase.com",
  name = "Walter White",
  reasonCode = "expired_card",
  cardBrand = "visa",
  cardLast4 = "4242",
  locale = DEFAULT_EMAIL_LOCALE,
}: {
  email: string;
  name: string;
  /** `payment_methods.invalid_reason`, the provider's own code. */
  reasonCode: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  locale?: string | null;
}) {
  const resolvedLocale = resolveEmailLocale(locale);
  const messages = getEmailMessages(resolvedLocale);

  const t = createTranslator({
    messages,
    locale: resolvedLocale,
    namespace: "payment-method-invalid",
  });

  const reason = createTranslator({
    messages,
    locale: resolvedLocale,
    namespace: "payment-decline-reason",
  });

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
              {cardBrand && cardLast4
                ? t.rich("descriptionCard", {
                    brand: cardBrand,
                    last4: cardLast4,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })
                : t.rich("description", {
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
            </Text>
            <Text className="text-black text-sm leading-6">
              {reason(declineReasonKey(reasonCode))}
            </Text>
            <Text className="text-black text-sm leading-6">
              {t.rich("hint", {
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
