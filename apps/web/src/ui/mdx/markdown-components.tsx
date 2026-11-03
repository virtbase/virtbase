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

import { pickBestDiscount } from "@virtbase/db/queries";
import { formatBytes, PUBLIC_DOMAIN } from "@virtbase/utils";
import { asMarkdown, md } from "fumadocs-core/server";
import type { Locale } from "next-intl";
import { getExtracted, getFormatter } from "next-intl/server";
import type { ReactNode } from "react";
import { getAvailablePlans } from "@/features/checkout/api/get-available-plans.ts";
import { getTermPath } from "@/features/glossary/glossary.ts";
import { SHOWCASED_OPERATING_SYSTEMS } from "@/features/landing/components/operating-system-showcase.tsx";
import type { MarkdownComponentName } from "@/ui/mdx/markdown-component-names.ts";

type Children = { children?: ReactNode };

/** A layout block: in Markdown, only its content remains. */
function Pass({ children }: Children) {
  asMarkdown();
  return md`${children}\n\n`;
}

/** Text set in bold, as a Markdown document would have written it. */
function Bold({ children }: Children) {
  asMarkdown();
  return md`**${children}**`;
}

/** A control that only exists on screen, such as a tab bar. */
function Omit() {
  asMarkdown();
  return md``;
}

/** The components whose Markdown does not depend on the locale. */
const staticComponents = {
  // Written by `remarkCodeTab` from consecutive code blocks with `tab="…"`.
  // Each tab becomes its label followed by its code block.
  CodeBlockTabs: Pass,
  CodeBlockTabsList: Omit,
  CodeBlockTabsTrigger: Omit,
  // On screen these are set apart from emphasis; in Markdown, bold is enough.
  Ui: Bold,
  Msg: Bold,
  CodeBlockTab: ({ value, children }: Children & { value: string }) => {
    asMarkdown();
    return md`${value}:\n\n${children}\n\n`;
  },
  Hero: Pass,
  Prose: Pass,
  Split: Pass,
  SplitText: Pass,
  SplitAside: Pass,
  Features: Pass,
  Advantages: Pass,
  Stats: Pass,
  Steps: Pass,
  Step: Pass,
  Hint: ({ children }: Children) => {
    asMarkdown();
    return md.linePrefix("> ")`${children}`;
  },
  Video: ({ id, title }: { id: string; title: string }) => {
    asMarkdown();
    return md`[${title}](https://www.youtube.com/watch?v=${id})\n\n`;
  },
  Stat: ({ value, label }: { value: string; label: string }) => {
    asMarkdown();
    return md`- **${value}** ${label}\n`;
  },
  Faq: ({ title, children }: Children & { title: string }) => {
    asMarkdown();
    return md`## ${title}\n\n${children}\n\n`;
  },
  Question: ({ title, children }: Children & { title: string }) => {
    asMarkdown();
    return md`### ${title}\n\n${children}\n\n`;
  },
};

type Translator = Awaited<ReturnType<typeof getExtracted>>;
type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/** The live plans as a table, priced as the offer cards price them. */
async function offersTable(t: Translator, format: Formatter) {
  const header = [
    t("Plan"),
    "vCores",
    "RAM",
    t("Storage"),
    t("Price per month"),
  ];
  const rows = (await getAvailablePlans()).map((plan) => {
    const { finalPrice } = pickBestDiscount(
      plan.price,
      plan.activeDiscounts,
      "purchase",
    );
    return [
      plan.name,
      String(plan.cores),
      formatBytes(plan.memory * 1024 * 1024, { formatter: format }),
      formatBytes(plan.storage * 1024 * 1024 * 1024, { formatter: format }),
      format.number(finalPrice / 100, { style: "currency", currency: "EUR" }),
    ];
  });

  return [
    `| ${header.join(" | ")} |`,
    `|${" --- |".repeat(header.length)}`,
    ...rows.map((cells) => `| ${cells.join(" | ")} |`),
    "",
    `${t("1 IPv4 + IPv6 /64 Subnet")}, ${t("Unlimited traffic")}.`,
  ].join("\n");
}

/**
 * The Markdown form of every MDX component a document may use, for the
 * Markdown served to agents. A component missing here would be written out as
 * JSX, which is the one thing an agent cannot read as prose.
 *
 * Built per request because the live blocks - prices, plan specifications,
 * links - are formatted for the locale.
 */
export async function getMarkdownComponents(locale: Locale) {
  // One call site each: next-intl rewrites these calls at compile time.
  const t = await getExtracted({ locale });
  const format = await getFormatter({ locale });

  const absolute = (href: string) =>
    /^https?:/.test(href) ? href : `${PUBLIC_DOMAIN}/${locale}${href}`;

  const section = ({
    title,
    href,
    children,
  }: Children & { title: string; href?: string }) => {
    asMarkdown();
    const more = href ? `[${t("Learn more")}](${absolute(href)})\n\n` : "";
    return md`### ${title}\n\n${children}\n\n${more}`;
  };

  return {
    ...staticComponents,
    Feature: section,
    Advantage: section,
    // The term stays in the text, linked to its entry, so an agent can follow
    // it to the definition.
    Term: ({ id, children }: Children & { id: string }) => {
      asMarkdown();
      return md`[${children}](${absolute(getTermPath(id))})`;
    },
    OperatingSystems: () => {
      asMarkdown();
      const names = SHOWCASED_OPERATING_SYSTEMS.map(({ alt }) => alt);
      return md`${format.list(names)}\n\n`;
    },
    Offers: async () => {
      asMarkdown();
      return md`${await offersTable(t, format)}\n\n`;
    },
  } satisfies Record<MarkdownComponentName, unknown>;
}
