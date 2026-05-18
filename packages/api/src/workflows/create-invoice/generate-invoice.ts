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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { serverPlanPrices, serverPlans } from "@virtbase/db/schema";
import { APP_NAME, formatBits, formatBytes } from "@virtbase/utils";
import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import { createFormatter, createTranslator } from "use-intl/core";
import { FatalError } from "workflow";
import { lexware } from "../../lexware";
import type { LexwareCountry } from "../../lexware/constants";
import {
  LEXWARE_COUNTRY_CONTACTS,
  LEXWARE_COUNTRY_TAX_RATES,
  LEXWARE_HOME_COUNTRY,
} from "../../lexware/constants";
import {
  lexwareInvoiceMessages,
  mapLexwareCountryToLocale,
} from "../../lexware/translations";
import { stripe } from "../../stripe";

type GenerateInvoiceStepInput = {
  billingDetails: {
    name: string | null;
    email: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      postal_code: string | null;
      country: string | null;
    };
  };
  configuration: OrderConfigurationSnapshot;
};

// TODO: Idempotent step
export async function generateInvoiceStep({
  billingDetails,
  configuration,
}: GenerateInvoiceStepInput) {
  "use step";

  if (!stripe) {
    throw new FatalError(
      "STRIPE_SECRET_KEY is not set in the .env. Cannot generate invoice.",
    );
  }

  if (!lexware) {
    throw new FatalError(
      "LEXWARE_API_KEY is not set in the .env. Cannot generate invoice.",
    );
  }

  const { name, email } = billingDetails;

  if (!name) {
    console.warn(
      "Billing name is missing in Stripe charge. Falling back to collective contact name.",
    );
  }

  const { country, line1, line2, postal_code, city } = billingDetails.address;

  if (!country || !city || !postal_code || !line1) {
    throw new FatalError(
      "Billing address is missing at least one of the following fields: country, city, postal_code, line1. Cannot generate invoice.",
    );
  }

  const taxRatePercentage =
    LEXWARE_COUNTRY_TAX_RATES[country as LexwareCountry];
  if (!taxRatePercentage) {
    throw new FatalError(
      `The tax rate percentage for country ${country} has not been configured. Cannot generate invoice.`,
    );
  }

  const contactId = LEXWARE_COUNTRY_CONTACTS[country as LexwareCountry];
  if (!contactId) {
    throw new FatalError(
      `The collective contact ID for country ${country} has not been configured. Cannot generate invoice.`,
    );
  }

  try {
    // Check if the collective contact exists within Lexware.
    // Otherwise the default contact may be used which is not what we want.
    await lexware.retrieveContact(contactId);
  } catch {
    throw new FatalError(
      `The collective contact ID ${contactId} does not exist within Lexware. Cannot generate invoice.`,
    );
  }

  const planId = configuration.server_plan_id;
  const serverPlanPriceId = configuration.server_plan_price_id;

  const plan = await db.transaction(
    async (tx) => {
      return tx
        .select({
          name: serverPlans.name,
          cores: serverPlans.cores,
          memory: serverPlans.memory,
          storage: serverPlans.storage,
          netrate: serverPlans.netrate,
          purchasePrice: serverPlanPrices.purchasePrice,
          renewalPrice: serverPlanPrices.renewalPrice,
        })
        .from(serverPlans)
        .innerJoin(
          serverPlanPrices,
          eq(serverPlanPrices.serverPlanId, serverPlans.id),
        )
        .where(eq(serverPlanPrices.id, serverPlanPriceId))
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!plan) {
    throw new FatalError(
      `The plan price with ID ${serverPlanPriceId} (plan ${planId}) does not exist. Cannot generate invoice.`,
    );
  }

  // Different order types charge different amounts:
  // - `extend_server`: the locked renewal price.
  // - `upgrade_server`: the pro-rata charge captured in the snapshot
  //   (`upgrade_charge`). The customer keeps their existing term, so the
  //   invoice reflects only the difference they paid today rather than
  //   the new plan's full price.
  // - `new_server`: the locked purchase price of the new plan.
  const linePriceCents =
    configuration.type === "extend_server"
      ? plan.renewalPrice
      : configuration.type === "upgrade_server"
        ? configuration.upgrade_charge
        : plan.purchasePrice;

  const mappedLocale = mapLexwareCountryToLocale(country as LexwareCountry);
  const t = createTranslator({
    locale: mappedLocale,
    messages: lexwareInvoiceMessages[mappedLocale],
  });
  const formatter = createFormatter({
    locale: mappedLocale,
  });

  const memoryFormatted = formatBytes(plan.memory * 1024 * 1024, { formatter });
  const storageFormatted = formatBytes(plan.storage * 1024 * 1024 * 1024, {
    formatter,
  });
  const netrateFormatted = plan.netrate
    ? formatBits(plan.netrate * 1e6 * 8, {
        formatter,
        perSecond: true,
        base: 1000,
        unit: "gigabit",
      })
    : null;

  // TODO: Add usage timestamps
  const invoice = await lexware.createInvoice(
    {
      archived: false,
      voucherDate: new Date().toISOString(),
      // Lexware only supports German and English invoices
      language: country === "DE" ? "de" : "en",
      lineItems: [
        {
          // Upgrades are pro-rated and only cover the price difference for
          // the time left on the term, so the line item is labelled
          // accordingly to avoid confusing the customer with the full plan
          // price when they're charged a fraction of it.
          name:
            configuration.type === "upgrade_server"
              ? t("upgradeLineItemName", { name: plan.name })
              : plan.name,
          // TODO: Translate / more dynamic
          description: [
            `${plan.cores} ${plan.cores > 1 ? "vCores" : "vCore"}`,
            `${memoryFormatted} RAM`,
            `${storageFormatted} NVMe SSD`,
            `${netrateFormatted || "∞"} Uplink`,
            `1x IPv4 /32 + 1x IPv6 /64`,
          ]
            .map((item) => `• ${item}`)
            .join("\n"),
          quantity: 1,
          type: "custom",
          unitPrice: {
            currency: "EUR",
            grossAmount: linePriceCents / 100,
            taxRatePercentage,
          },
          unitName: t("unitName"),
          discountPercentage: 0,
        },
      ],
      totalPrice: {
        currency: "EUR",
      },
      taxConditions: {
        taxType: "gross",
        ...(country !== LEXWARE_HOME_COUNTRY && {
          // Set the OSS country according to the home country
          taxSubType: "electronicServices",
        }),
      },
      address: {
        name: name || APP_NAME,
        city,
        contactId,
        countryCode: country,
        street: line1,
        ...(line2 && { supplement: line2 }),
        zip: postal_code,
      },
      shippingConditions: {
        shippingType: "service",
        shippingDate: new Date().toISOString(),
      },
      // Translated fields per country
      title: t("invoiceTitle"),
      introduction: t("introduction"),
      remark: t("remark", { appName: APP_NAME }),
      paymentConditions: {
        paymentTermDuration: 7,
        paymentTermLabel: t("paymentConditionText"),
      },
    },
    {
      finalize: process.env.NODE_ENV === "production",
    },
  );

  return {
    createdInvoiceId: invoice.id,
    customerEmail: email,
  };
}
