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

import type { EmailTitles, EmailTranslations } from ".";

export const titles = {
  en: "A new invoice has been created",
} as const satisfies EmailTitles;

export const messages = {
  en: {
    preview: "Your invoice is available",
    heading: "Your invoice is available",
    greeting: "Hi {name}!",
    description:
      "Thank you for your purchase at {appName}. Your invoice is available for download. Please find it in the attachments of this email.",
    voucherNumber: "Invoice number",
    totalAmount: "Total amount",
    taxAmount: "Included tax",
    viewInvoice: "View invoice in customer portal",
  },
} as const satisfies EmailTranslations;
