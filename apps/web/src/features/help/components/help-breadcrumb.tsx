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

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@virtbase/ui/breadcrumb";
import { PUBLIC_DOMAIN } from "@virtbase/utils";
import { getExtracted, getLocale } from "next-intl/server";
import { Fragment } from "react";
import type { HelpCategoryDetails } from "@/features/help/categories.tsx";
import { IntlLink } from "@/i18n/navigation.public.ts";
import { BreadcrumbJsonLd } from "@/ui/seo/breadcrumb-json-ld.tsx";

/**
 * The trail from the help center to the current page - "All categories", then
 * the category when the page is an article, then the page itself. Rendered and
 * emitted as `BreadcrumbList` structured data, so the two never disagree.
 */
export async function HelpBreadcrumb({
  category,
  title,
}: {
  /** The article's primary category. Omitted on a category's own page. */
  category?: Pick<HelpCategoryDetails, "slug" | "title"> | undefined;
  title: string;
}) {
  const locale = await getLocale();
  const t = await getExtracted();

  const items: { name: string; href?: string }[] = [
    { name: t("All categories"), href: "/help" },
    ...(category
      ? [{ name: category.title, href: `/help/category/${category.slug}` }]
      : []),
    { name: title },
  ];

  return (
    <>
      <Breadcrumb className="text-muted-foreground text-sm">
        <BreadcrumbList>
          {items.map(({ name, href }, index) => (
            <Fragment key={href ?? name}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {href ? (
                  <BreadcrumbLink asChild>
                    <IntlLink href={href} prefetch={false}>
                      {name}
                    </IntlLink>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="text-muted-foreground">
                    {name}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <BreadcrumbJsonLd
        items={items.map(({ name, href }) => ({
          name,
          ...(href && { url: `${PUBLIC_DOMAIN}/${locale}${href}` }),
        }))}
      />
    </>
  );
}
