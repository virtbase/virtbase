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

import { Button } from "@virtbase/ui/button";
import {
  LucideLayoutDashboard,
  LucideLifeBuoy,
  LucideNetwork,
  LucideShield,
} from "@virtbase/ui/icons";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "next-intl";
import { getExtracted, setRequestLocale } from "next-intl/server";
import { IntlLink } from "@/i18n/navigation.public";

export async function AdvantagesRow({ locale }: { locale: Locale }) {
  "use cache";

  cacheTag("advantages-row");
  cacheLife("max");

  setRequestLocale(locale);

  const t = await getExtracted({
    locale,
  });

  const items = [
    {
      title: t("Maximum privacy"),
      description: t(
        "With us, privacy comes first. No sharing with third parties, ever.",
      ),
      icon: LucideShield,
      href: "/help/article/about-security",
    },
    {
      title: t("Genuine support"),
      description: t(
        "We offer human support around the clock, whenever you need it.",
      ),
      icon: LucideLifeBuoy,
      href: "/contact",
    },
    {
      title: t("DDoS protection included"),
      description: t(
        "Active DDoS protection keeps you online. No extra charges, ever.",
      ),
      icon: LucideNetwork,
      href: "/help/article/about-ddos-protection",
    },
    {
      title: t("Modern customer portal"),
      description: t(
        "Efficiently manage your servers without hassle or frustration.",
      ),
      icon: LucideLayoutDashboard,
      href: "/help",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-px bg-border text-sm sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: index is unique
          key={index}
          className="flex flex-col items-start gap-2 bg-background p-8 text-left lg:px-9 lg:py-10"
        >
          <item.icon className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="font-medium">{item.title}</h3>
          <div className="max-w-xs text-pretty text-muted-foreground sm:max-w-none [&_a]:font-medium [&_a]:text-foreground/80 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2 [&_a]:hover:text-foreground">
            <p>{item.description}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <IntlLink href={item.href} prefetch={false} className="mt-3 w-fit">
              {t("Learn more")}
            </IntlLink>
          </Button>
        </div>
      ))}
    </div>
  );
}
