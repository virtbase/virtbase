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

import { captureException } from "@sentry/nextjs";
import { stripe } from "@virtbase/integration-stripe";
import { buttonVariants } from "@virtbase/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideBadgeAlert,
  LucideCheck,
  LucideClock,
  LucideCreditCard,
  LucideShieldAlert,
  LucideX,
} from "@virtbase/ui/icons";
import { APP_DOMAIN, constructMetadata, PUBLIC_DOMAIN } from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { getExtracted, getLocale } from "next-intl/server";
import { cache } from "react";
import { ConfettiFireworks } from "@/features/checkout/components/confetti-fireworks";
import { IntlLink } from "@/i18n/navigation.public";

export async function generateMetadata(): Promise<Metadata> {
  "use cache";

  const locale = await getLocale();
  const t = await getExtracted({ locale });

  cacheLife("max");
  cacheTag("home", locale);

  return constructMetadata({
    fullTitle: t("Payment details"),
    description: t(
      "Your payment has been processed. Here you can see the details of your order.",
    ),
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}/checkout/return`,
    noIndex: true,
  });
}

/**
 * The payment intent statuses this page has copy for.
 *
 * `Stripe.PaymentIntent.Status` became an open union in SDK 22.6 - every
 * enum-like union now ends in `string & {}` so a client keeps compiling against
 * a status the API grows later. That forward compatibility is welcome, but it
 * also means the type can no longer prove the map below is exhaustive. The set
 * is therefore spelled out here, `satisfies` keeps the map and this list in
 * step, and `getPaymentIntentStatus` folds anything outside it into `canceled`.
 */
const KNOWN_STATUSES = [
  "canceled",
  "processing",
  "requires_action",
  "requires_capture",
  "requires_confirmation",
  "requires_payment_method",
  "succeeded",
] as const;

type KnownStatus = (typeof KNOWN_STATUSES)[number];

const isKnownStatus = (status: string): status is KnownStatus =>
  (KNOWN_STATUSES as readonly string[]).includes(status);

const getStatusMap = cache(async () => {
  const t = await getExtracted();

  return {
    canceled: {
      icon: LucideX,
      success: false,
      title: t("Order canceled"),
      description: t("The order has been canceled and will not be processed."),
      description2: t(
        "Please go back to the checkout and try again with a different payment method.",
      ),
    },
    processing: {
      icon: LucideClock,
      success: true,
      title: t("Payment is being processed"),
      description: t(
        "Due to the chosen payment method, the order will only be processed after the payment has been successfully processed.",
      ),
      description2: t(
        "We will send an email with all the details once the order has been processed.",
      ),
    },
    requires_action: {
      icon: LucideShieldAlert,
      success: false,
      title: t("Order requires action"),
      description: t("The order requires an action from you."),
      description2: t(
        "Please perform the action and the order will be automatically processed.",
      ),
    },
    requires_capture: {
      icon: LucideClock,
      success: true,
      title: t("Order requires payment"),
      description: t("The order requires a payment."),
      description2: t("We will initiate the payment and process the order."),
    },
    requires_confirmation: {
      icon: LucideBadgeAlert,
      success: false,
      title: t("Order requires confirmation"),
      description: t(
        "The order requires a confirmation by your payment method.",
      ),
      description2: t(
        "Perform the confirmation and the order will be automatically processed.",
      ),
    },
    requires_payment_method: {
      icon: LucideCreditCard,
      success: false,
      title: t("Order requires payment method"),
      description: t(
        "The order requires a valid payment method. Please go back to the checkout and try again. ",
      ),
      description2: t(
        "If the problem persists, try using a different payment method.",
      ),
    },
    succeeded: {
      icon: LucideCheck,
      success: true,
      title: t("Order successful"),
      description: t(
        "The order has been successfully completed and will now be automatically processed.",
      ),
      description2: t(
        "We will send an email with all the details once the booked products are set up.",
      ),
    },
  } satisfies Record<KnownStatus, unknown>;
});

const getPaymentIntentStatus = cache(async (payment_intent: string) => {
  "use cache";

  cacheLife("minutes");
  cacheTag(payment_intent);

  try {
    if (!stripe) {
      return "canceled";
    }

    const { status } = await stripe.paymentIntents.retrieve(payment_intent);

    // Same fallback as the error path below, and for the same reason: a status
    // this build has no copy for is not one to fire the confetti over.
    return isKnownStatus(status) ? status : "canceled";
  } catch (error) {
    captureException(error);

    // Fallback to canceled status
    return "canceled";
  }
});

export default async function CheckoutSuccessPage({
  searchParams,
}: PageProps<"/[locale]/checkout/return">) {
  "use cache: private";

  const { payment_intent } = await searchParams;
  if (!payment_intent || "string" !== typeof payment_intent) {
    notFound();
  }

  cacheLife("minutes");
  cacheTag(payment_intent);

  const t = await getExtracted();

  const paymentStatus = await getPaymentIntentStatus(payment_intent);
  const statusMap = await getStatusMap();

  const status = statusMap[paymentStatus];

  return (
    <>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <status.icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{status.title}</EmptyTitle>
          <EmptyDescription>{status.description}</EmptyDescription>
          <EmptyDescription>{status.description2}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <IntlLink
              href="/"
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
              })}
              prefetch={false}
            >
              {t("Back to home")}
            </IntlLink>
            <a
              href={APP_DOMAIN}
              className={buttonVariants({
                variant: "default",
                size: "sm",
              })}
            >
              {t("Back to customer portal")}
            </a>
          </div>
        </EmptyContent>
        <EmptyContent>
          <IntlLink
            href="/contact"
            className="text-muted-foreground text-xs transition-colors hover:text-foreground/80"
            prefetch={false}
          >
            {t("Need help? Contact us ↗")}
          </IntlLink>
        </EmptyContent>
      </Empty>
      {status.success && <ConfettiFireworks />}
    </>
  );
}
