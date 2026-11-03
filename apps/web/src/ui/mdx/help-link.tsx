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

import { LucideArrowUpRight, LucideLayoutDashboard } from "@virtbase/ui/icons";
import { APP_DOMAIN, PUBLIC_DOMAIN } from "@virtbase/utils";
import Link from "fumadocs-core/link";
import { getExtracted } from "next-intl/server";
import type { ComponentProps } from "react";

/**
 * Documents link to the portal as `https://app.virtbase.com/...`, whatever the
 * environment; the current app domain is accepted as well.
 */
const PORTAL_HOSTS = new Set([
  "app.virtbase.com",
  new URL(APP_DOMAIN).hostname,
]);
const SITE_HOST = new URL(PUBLIC_DOMAIN).hostname;

type Destination = "page" | "portal" | "external";

function destinationOf(href: string): Destination {
  // Relative paths, anchors and mail links stay where the reader is.
  if (!/^https?:\/\//.test(href)) return "page";

  const { hostname } = new URL(href);
  if (PORTAL_HOSTS.has(hostname)) return "portal";
  return hostname === SITE_HOST ? "page" : "external";
}

/**
 * A link in a help document, marked by where it leads: nothing for another
 * page of the site, a portal icon for the customer portal and an outward arrow
 * for any other website. Both of those open in a new tab - Fumadocs' `Link`
 * does that for every absolute URL - so the steps stay open next to them. The
 * icon is decorative; screen readers get the same information as text.
 */
export async function HelpLink({
  href = "",
  children,
  ...props
}: ComponentProps<"a">) {
  const destination = destinationOf(href);
  if (destination === "page") {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }

  const t = await getExtracted();
  const Icon =
    destination === "portal" ? LucideLayoutDashboard : LucideArrowUpRight;
  const label =
    destination === "portal"
      ? t("customer portal, opens in a new tab")
      : t("external website, opens in a new tab");

  return (
    <Link href={href} {...props}>
      {children}
      <span className="sr-only"> ({label})</span>
      <Icon
        aria-hidden="true"
        className="ml-0.5 inline-block size-[0.85em] align-[-0.05em]"
        strokeWidth={2}
      />
    </Link>
  );
}
