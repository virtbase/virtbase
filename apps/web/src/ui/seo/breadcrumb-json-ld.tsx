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

import type { BreadcrumbList, WithContext } from "schema-dts";

import JsonLd from "./json-ld";

export type BreadcrumbJsonLdItem = {
  /**
   * The label as it appears in the breadcrumb rendered on the page. Structured
   * data that disagrees with the visible trail is ignored by crawlers.
   */
  name: string;
  /** Absolute URL. Omit on the last item, which is the current page. */
  url?: string;
};

/**
 * `BreadcrumbList` structured data for the trail rendered on the page.
 *
 * Pass the items in order, outermost first. The last item is the current page
 * and carries no URL, which is what Google expects.
 */
export function BreadcrumbJsonLd({ items }: { items: BreadcrumbJsonLdItem[] }) {
  const breadcrumbList: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url && { item: item.url }),
    })),
  };

  return <JsonLd schema={breadcrumbList} />;
}
