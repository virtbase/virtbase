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
import type { InvoiceForCreate, InvoiceRetrieveResponse } from "./types";

const EUR = "EUR";

const money = (amount: number | undefined) =>
  typeof amount === "number"
    ? // Lexware returns euros as a float; the rest of the system counts cents.
      { amount: Math.round(amount * 100), currency: EUR }
    : null;

/**
 * Maps the {@link InvoiceProvider} port onto Lexware's invoicing API.
 *
 * Everything Lexware-shaped lives here: the collective contact per country used
 * for OSS invoicing, the `gross` tax conditions, the document copy, and the
 * euros-as-floats convention. Callers hand over an address and some line items.
 */
export class LexwareInvoiceProvider implements InvoiceProvider {
  private readonly client: LexwareClient;

  constructor(client: LexwareClient) {
    this.client = client;
  }

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const { address, lineItems, locale, finalize } = input;
    const country = address.countryCode as ContactCountry;

    const contactId = COUNTRY_CONTACTS[country];
    if (!contactId) {
      throw this.fail(
        `No collective contact is configured for country ${address.countryCode}.`,
        { retryable: false },
      );
    }

    // Without this check Lexware silently bills a default contact, which
    // produces a plausible-looking invoice made out to the wrong party.
    try {
      await this.client.retrieveContact(contactId);
    } catch (error) {
      throw this.fail(
        `The collective contact ${contactId} does not exist in Lexware.`,
        { retryable: false, cause: error },
      );
    }

    const t = createTranslator({
      locale: resolveInvoiceLocale(locale),
      messages: invoiceMessages[resolveInvoiceLocale(locale)],
    });

    const now = new Date().toISOString();

    const payload: InvoiceForCreate = {
      archived: false,
      voucherDate: now,
      // Lexware only renders German and English invoices.
      language: country === "DE" ? "de" : "en",
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
      totalPrice: {
        currency: EUR,
      },
      taxConditions: {
        taxType: "gross",
        ...(country !== HOME_COUNTRY && {
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
      shippingConditions: {
        shippingType: "service",
        shippingDate: now,
      },
      title: t("invoiceTitle"),
      introduction: t("introduction"),
      remark: t("remark", { appName: APP_NAME }),
      paymentConditions: {
        paymentTermDuration: 7,
        paymentTermLabel: t("paymentConditionText"),
      },
    };

    const created = await this.client.createInvoice(payload, { finalize });

    // The create response carries only an id, so the amounts are read back.
    return this.retrieveInvoice(created.id);
  }

  async retrieveInvoice(externalId: string): Promise<Invoice> {
    let invoice: InvoiceRetrieveResponse;
    try {
      invoice = await this.client.retrieveInvoice(externalId);
    } catch (error) {
      throw this.fail(`Failed to retrieve invoice ${externalId}.`, {
        retryable: true,
        cause: error,
      });
    }

    const total = invoice.totalPrice;

    return {
      externalId,
      number: invoice.voucherNumber ?? null,
      netAmount: money(total?.totalNetAmount),
      taxAmount: money(total?.totalTaxAmount),
      grossAmount: money(total?.totalGrossAmount),
      issuedAt: invoice.voucherDate ? new Date(invoice.voucherDate) : null,
    };
  }

  async downloadInvoice(externalId: string): Promise<ArrayBuffer> {
    try {
      return await this.client.downloadInvoice(externalId);
    } catch (error) {
      throw this.fail(`Failed to download invoice ${externalId}.`, {
        retryable: true,
        cause: error,
      });
    }
  }

  private fail(
    message: string,
    options: { retryable: boolean; cause?: unknown },
  ): PortError {
    return new PortError(message, {
      port: "invoice",
      integrationId: "lexware",
      ...options,
    });
  }
}
