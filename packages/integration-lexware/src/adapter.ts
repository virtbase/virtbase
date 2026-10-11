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

import { isIntegrationError } from "@virtbase/integration-sdk";
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceProvider,
} from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import { APP_NAME } from "@virtbase/utils";
import { createTranslator } from "use-intl/core";
import type { LexwareClient } from "./client";
import type { ContactCountry } from "./constants";
import { COUNTRY_CONTACTS, HOME_COUNTRY } from "./constants";
import { invoiceMessages, resolveInvoiceLocale } from "./messages";
import type { InvoiceForCreate } from "./payload";

const EUR = "EUR";

/** The payment term printed on every invoice, in days. */
const PAYMENT_TERM_DAYS = 7;

const money = (amount: number | null | undefined) =>
  typeof amount === "number"
    ? // Lexware returns euros as a float; the rest of the system counts cents.
      { amount: Math.round(amount * 100), currency: EUR }
    : null;

/**
 * Whether {@link COUNTRY_CONTACTS} has a collective contact for `code`. An own
 * property check, because `"constructor" in COUNTRY_CONTACTS` is true.
 */
const isContactCountry = (code: string): code is ContactCountry =>
  Object.hasOwn(COUNTRY_CONTACTS, code);

/**
 * Whether a failed create can be repeated without issuing the invoice twice:
 * only a 429, which Lexware answers before it processes the request. After a
 * timeout, a lost connection or a 5xx the invoice may exist.
 */
export const isCreateRetryable = (error: unknown): boolean =>
  isIntegrationError(error) &&
  error.code === "lexware.request_failed" &&
  error.params.status === 429;

const isNotFound = (error: unknown) =>
  isIntegrationError(error) &&
  error.code === "lexware.request_failed" &&
  error.params.status === 404;

/**
 * Maps the {@link InvoiceProvider} port onto Lexware's invoicing API.
 *
 * Everything Lexware-shaped lives here: the collective contact per country used
 * for OSS invoicing, the `gross` tax conditions, the document copy, and the
 * euros-as-floats convention. Callers hand over an address and some line items.
 *
 * Every failure reaches the caller as a {@link PortError}. A read or a
 * download is retryable when the {@link LexwareClient} marked the underlying
 * `IntegrationError` retryable; a create only by {@link isCreateRetryable}.
 */
export class LexwareInvoiceProvider implements InvoiceProvider {
  private readonly client: LexwareClient;

  constructor(client: LexwareClient) {
    this.client = client;
  }

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const contactId = await this.collectiveContact(input.address.countryCode);
    const payload = buildInvoice({ input, contactId, now: new Date() });

    let created: { id: string };
    try {
      created = await this.client.createInvoice(payload, {
        finalize: input.finalize,
      });
    } catch (error) {
      throw new PortError("Failed to create the invoice.", {
        port: "invoice",
        integrationId: "lexware",
        retryable: isCreateRetryable(error),
        cause: error,
      });
    }

    // The create response carries only an id, so the amounts are read back.
    // [!] A failure here is never retryable: the invoice exists, and a caller
    // that retried createInvoice() would issue a second one.
    try {
      return await this.retrieveInvoice(created.id);
    } catch (error) {
      throw new PortError(
        `Invoice ${created.id} was created, but reading it back failed.`,
        {
          port: "invoice",
          integrationId: "lexware",
          retryable: false,
          cause: error,
        },
      );
    }
  }

  async retrieveInvoice(externalId: string): Promise<Invoice> {
    try {
      const invoice = await this.client.retrieveInvoice(externalId);
      const total = invoice.totalPrice;
      return {
        externalId,
        number: invoice.voucherNumber ?? null,
        netAmount: money(total?.totalNetAmount),
        taxAmount: money(total?.totalTaxAmount),
        grossAmount: money(total?.totalGrossAmount),
        issuedAt: invoice.voucherDate ? new Date(invoice.voucherDate) : null,
      };
    } catch (error) {
      throw this.fail(error, `Failed to retrieve invoice ${externalId}.`);
    }
  }

  async downloadInvoice(externalId: string): Promise<ArrayBuffer> {
    try {
      return await this.client.downloadInvoice(externalId);
    } catch (error) {
      throw this.fail(error, `Failed to download invoice ${externalId}.`);
    }
  }

  /**
   * The collective contact the invoice is billed against. Without the lookup
   * Lexware bills a default contact, which produces a plausible-looking
   * invoice made out to the wrong party.
   */
  private async collectiveContact(countryCode: string): Promise<string> {
    if (!isContactCountry(countryCode)) {
      throw this.fail(
        null,
        `No collective contact is configured for country ${countryCode}.`,
      );
    }
    const contactId = COUNTRY_CONTACTS[countryCode];
    try {
      await this.client.retrieveContact(contactId);
    } catch (error) {
      throw this.fail(
        error,
        isNotFound(error)
          ? `The collective contact ${contactId} does not exist in Lexware.`
          : `Failed to look up the collective contact ${contactId}.`,
      );
    }
    return contactId;
  }

  private fail(cause: unknown, message: string): PortError {
    return new PortError(message, {
      port: "invoice",
      integrationId: "lexware",
      retryable: isIntegrationError(cause) && cause.retryable,
      cause,
    });
  }
}

/** The Lexware invoice for `input`, billed against `contactId` and dated `now`. */
const buildInvoice = ({
  input: { address, lineItems, locale },
  contactId,
  now,
}: {
  input: CreateInvoiceInput;
  contactId: string;
  now: Date;
}): InvoiceForCreate => {
  const invoiceLocale = resolveInvoiceLocale(locale);
  const t = createTranslator({
    locale: invoiceLocale,
    messages: invoiceMessages[invoiceLocale],
  });
  const date = now.toISOString();

  return {
    archived: false,
    voucherDate: date,
    // Lexware only renders German and English invoices.
    language: address.countryCode === "DE" ? "de" : "en",
    lineItems: lineItems.map((item) => ({
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      type: "custom",
      unitPrice: {
        currency: EUR,
        grossAmount: item.unitPrice.amount / 100,
        taxRatePercentage: item.taxRatePercentage,
      },
      unitName: t("unitName"),
      discountPercentage: 0,
    })),
    totalPrice: { currency: EUR },
    taxConditions: {
      taxType: "gross",
      ...(address.countryCode !== HOME_COUNTRY && {
        // Sales outside the home country go through the One-Stop-Shop.
        taxSubType: "electronicServices",
      }),
    },
    address: {
      name: address.name || APP_NAME,
      city: address.city,
      contactId,
      countryCode: address.countryCode,
      street: address.street,
      ...(address.supplement && { supplement: address.supplement }),
      zip: address.zip,
    },
    shippingConditions: { shippingType: "service", shippingDate: date },
    title: t("invoiceTitle"),
    introduction: t("introduction"),
    remark: t("remark", { appName: APP_NAME }),
    paymentConditions: {
      paymentTermDuration: PAYMENT_TERM_DAYS,
      paymentTermLabel: t("paymentConditionText"),
    },
  };
};
