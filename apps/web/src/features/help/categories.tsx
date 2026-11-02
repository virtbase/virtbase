/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { LucideIcon } from "@virtbase/ui/icons";
import {
  LucideCreditCard,
  LucideDatabaseBackup,
  LucideNetwork,
  LucideRocket,
  LucideServer,
  LucideShieldCheck,
  LucideWebhook,
} from "@virtbase/ui/icons";
import type { Locale } from "next-intl";
import { getExtracted, getLocale } from "next-intl/server";
import type { HelpCategory } from "@/lib/help-categories.ts";
import { HELP_CATEGORIES } from "@/lib/help-categories.ts";

export type HelpCategoryDetails = {
  slug: HelpCategory;
  title: string;
  description: string;
  Icon: LucideIcon;
};

const icons: Record<HelpCategory, LucideIcon> = {
  "getting-started": LucideRocket,
  servers: LucideServer,
  backups: LucideDatabaseBackup,
  networking: LucideNetwork,
  billing: LucideCreditCard,
  account: LucideShieldCheck,
  api: LucideWebhook,
};

/**
 * The help center's categories in display order, in the request's locale or in
 * `locale` where there is no request to take it from.
 */
export async function getHelpCategories(
  locale?: Locale,
): Promise<HelpCategoryDetails[]> {
  // One call site: next-intl rewrites `getExtracted` at compile time and does
  // not follow a conditional between two calls.
  const t = await getExtracted({ locale: locale ?? (await getLocale()) });

  const text: Record<HelpCategory, { title: string; description: string }> = {
    "getting-started": {
      title: t("Getting started"),
      description: t(
        "Learn the basics of Virtbase and set up your first server.",
      ),
    },
    servers: {
      title: t("Servers"),
      description: t(
        "Install an operating system, renew your server and manage it day to day.",
      ),
    },
    backups: {
      title: t("Backups"),
      description: t(
        "Back up your servers and restore them when something goes wrong.",
      ),
    },
    networking: {
      title: t("Networking & firewall"),
      description: t(
        "Firewall rules, DDoS protection and your server's network.",
      ),
    },
    billing: {
      title: t("Billing & payments"),
      description: t("Renewals, invoices and payment methods."),
    },
    account: {
      title: t("Account & security"),
      description: t("Keep your account secure, and manage or delete it."),
    },
    api: {
      title: t("API & integrations"),
      description: t(
        "Automate Virtbase with the public API and manage it from Discord.",
      ),
    },
  };

  return HELP_CATEGORIES.map((slug) => ({
    slug,
    ...text[slug],
    Icon: icons[slug],
  }));
}

/** One category in the request's locale, or `undefined` for an unknown slug. */
export async function getHelpCategory(
  slug: string | undefined,
  locale?: Locale,
): Promise<HelpCategoryDetails | undefined> {
  return (await getHelpCategories(locale)).find(
    (category) => category.slug === slug,
  );
}
