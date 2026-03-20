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
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "next-intl";
import { getExtracted, setRequestLocale } from "next-intl/server";
import { IntlLink } from "@/i18n/navigation.public";
import ServerFirewallDemo from "./server-firewall-demo";
import ServerStatsDemo from "./server-stats-demo";

export async function FeaturesShowcase({ locale }: { locale: Locale }) {
  "use cache";

  cacheTag("features-showcase");
  cacheLife("max");

  setRequestLocale(locale);

  const t = await getExtracted({
    locale,
  });

  return (
    <div className="grid grid-cols-1 border-grid-border md:grid-cols-2">
      <div className="contents divide-grid-border max-md:divide-y md:divide-x">
        <div className="relative flex flex-col gap-10 px-4 py-6 sm:px-10 sm:py-14">
          <div className="mask-[linear-gradient(black_50%,transparent)] relative h-72 overflow-hidden px-0 sm:h-[290px] lg:px-0">
            <ServerStatsDemo inert locale={locale} />
          </div>
          <div className="relative flex flex-col text-base">
            <h3 className="font-semibold">{t("Real-time server metrics")}</h3>
            <div className="mt-1 text-muted-foreground transition-colors [&_a]:font-medium [&_a]:text-foreground/80 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2 hover:[&_a]:text-foreground">
              <p>
                {t(
                  "Our server metrics are updated in real-time, so you can always see the current status of your servers.",
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <IntlLink href="/help" prefetch={false} className="mt-3 w-fit">
                {t("Learn more")}
              </IntlLink>
            </Button>
          </div>
        </div>
        <div className="relative flex flex-col gap-10 px-4 py-6 sm:px-10 sm:py-14">
          <div className="mask-[linear-gradient(black_50%,transparent)] relative h-72 overflow-hidden px-0 sm:h-[290px] lg:px-0">
            <ServerFirewallDemo inert />
          </div>
          <div className="relative flex flex-col text-base">
            <h3 className="font-semibold">{t("Stateless firewall")}</h3>
            <div className="mt-1 text-muted-foreground transition-colors [&_a]:font-medium [&_a]:text-foreground/80 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2 hover:[&_a]:text-foreground">
              <p>
                {t(
                  "With your own firewall rules, you can protect your server specifically. Each rule can be configured individually.",
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <IntlLink
                href="/help/article/how-to-use-server-firewall"
                prefetch={false}
                className="mt-3 w-fit"
              >
                {t("Learn more")}
              </IntlLink>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
