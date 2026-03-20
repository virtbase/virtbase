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

type Required<T> = {
  [P in keyof T]-?: T[P];
};

type AugmentedRequired<T extends object, K extends keyof T = keyof T> = Omit<
  T,
  K
> &
  Required<Pick<T, K>>;

export type Company = {
  name: string;
  taxNumber?: string;
  vatRegistrationId?: string;
  allowTaxFreeInvoices?: boolean;
  contactPersons?: {
    salutation?: string;
    firstName?: string;
    lastName: string;
    primary?: boolean;
    emailAddress?: string;
    phoneNumber?: string;
  }[];
};

export type AddressContact = {
  supplement?: string;
  street?: string;
  zip?: string;
  city?: string;
  countryCode: string;
};

export type ContactFull = {
  id: string;
  organizationId: string;
  version: number;
  roles: {
    customer?: {
      number: number;
    };
    vendor?: {
      number: number;
    };
  };
  // 1
  company?: Company;
  person?: {
    salutation?: string;
    firstName?: string;
    lastName: string;
  };
  // 2
  addresses: {
    billing?: AddressContact[];
    shipping?: AddressContact[];
  };
  xRechnung?: {
    buyerReference: string;
    vendorNumberAtCustomer: string;
  };
  // 3
  emailAddresses: EmailAddresses;
  // 4
  phoneNumbers: PhoneNumbers;
  note: string;
  archived: boolean;
};

export type EmailAddresses = {
  business?: string[];
  office?: string[];
  private?: string[];
  other?: string[];
};

export type PhoneNumbers = EmailAddresses & {
  mobile?: string[];
  fax?: string[];
};

export type ContactRetrieveResponse = Partial<ContactFull>;

export type Invoice = {
  id: string;
  organizationId: string;
  createdDate: string;
  updatedDate: string;
  version: number;
  language: string;
  archived: boolean;
  voucherStatus: string;
  voucherNumber: string;
  voucherDate: string;
  dueDate: string | null;
  // 1
  address:
    | Address
    | AddressExistingLexofficeContact
    | AddressNonExistingLexofficeContact;
  xRechnung?: {
    buyerReference: string;
    vendorNumberAtCustomer: string;
  } | null;
  //   2
  lineItems: (LineItem | CustomLineItem | TextLineItem)[];
  //   3
  totalPrice: TotalPrice | TotalPriceInvoiceCreate;
  // 4
  taxAmounts: TaxAmount[];
  //   5
  taxConditions: {
    taxType: string;
    taxTypeNote?: string;
  };
  //   6
  paymentConditions?: PaymentConditions;
  //   7
  shippingConditions:
    | ShippingConditions
    | ShippingConditionsNone
    | ShippingConditionsPeriod;
  closingInvoice: boolean;
  claimedGrossAmount: number;
  downPaymentDeductions: unknown[];
  recurringTemplateId: string | null;
  title?: string;
  introduction?: string;
  remark?: string;
  files: { documentFileId: string };
};

export type InvoiceRetrieveResponse = Partial<Invoice>;

export type InvoiceCreateResponse = {
  id: string;
  resourceUri: string;
  createdDate: string;
  updatedDate: string;
  version: number;
};

export type InvoiceForCreate = {
  language?: string;
  archived?: boolean;
  voucherDate: string;

  address:
    | Address
    | AddressExistingLexofficeContact
    | AddressNonExistingLexofficeContact;
  xRechnung?: {
    buyerReference: string;
    vendorNumberAtCustomer: string;
  } | null;
  lineItems: (CustomLineItem | TextLineItem)[];
  totalPrice: TotalPrice | TotalPriceInvoiceCreate;
  taxAmounts?: TaxAmount[];
  taxConditions: {
    taxType: string;
    taxTypeNote?: string;
  };
  paymentConditions?: PaymentConditions;
  shippingConditions:
    | ShippingConditions
    | ShippingConditionsNone
    | ShippingConditionsPeriod;
  recurringTemplateId?: string | null;
  title?: string;
  introduction?: string;
  remark?: string;
};

export type ShippingConditions = {
  shippingDate: string;
  shippingType: string;
};
export type ShippingConditionsPeriod = ShippingConditions & {
  shippingType: string;
  shippingEndDate: string;
};

export type PaymentConditions = {
  paymentTermLabel: string;
  paymentTermLabelTemplate?: string;
  paymentTermDuration: number;
  paymentDiscountConditions?: {
    discountPercentage: number;
    discountRange: number;
  };
};

export type ShippingConditionsNone = AugmentedRequired<
  Partial<ShippingConditions>,
  "shippingType"
>;

export type TotalPrice = {
  currency: string;
  totalNetAmount: number;
  totalGrossAmount: number;
  totalTaxAmount: number;
  totalDiscountAbsolute?: number;
  totalDiscountPercentage?: number;
};
export type TotalPriceInvoiceCreate = AugmentedRequired<
  Partial<TotalPrice>,
  "currency"
>;

export type TaxAmount = {
  taxRatePercentage: number;
  taxAmount: number;
  netAmount: number;
};

export type UnitPrice = {
  currency: string;
  netAmount: number;
  taxRatePercentage: number;
};

export type UnitPriceGross = AugmentedRequired<
  Partial<UnitPrice>,
  "currency" | "taxRatePercentage"
> & {
  grossAmount: number;
};

export type LineItem = {
  id?: string;
  type: string;
  name: string;
  description?: string;
  quantity: number;
  unitName: string;
  unitPrice: UnitPrice | UnitPriceGross;
  discountPercentage?: number;
  lineItemAmount: number;
};

export type CustomLineItem = Omit<LineItem, "lineItemAmount" | "id">;
export type TextLineItem = {
  type: string;
  name: string;
  description: string;
};

export type Address = {
  contactId: string;
  name: string;
  supplement?: string;
  street: string;
  city: string;
  zip: string;
  countryCode: string;
  contactPerson: string;
};

export type AddressExistingLexofficeContact = AugmentedRequired<
  Partial<Address>,
  "contactId"
>;
export type AddressNonExistingLexofficeContact = AugmentedRequired<
  Partial<Address>,
  "name" | "countryCode"
>;
