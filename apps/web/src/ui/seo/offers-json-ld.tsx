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

import type { DatabaseServerPlan } from "@virtbase/db/schema";
import { formatBits, formatBytes, PUBLIC_DOMAIN } from "@virtbase/utils";
import { getFormatter } from "next-intl/server";
import type { ItemList, WithContext } from "schema-dts";
import { ORGANIZATION_ID } from "./default-json-ld";
import JsonLd from "./json-ld";

/** Every currency the plan prices are quoted in. */
const CURRENCY = "EUR";

export type OfferJsonLdPlan = {
  id: DatabaseServerPlan["id"];
  name: DatabaseServerPlan["name"];
  /** Guaranteed vCores. */
  cores: DatabaseServerPlan["cores"];
  /** Guaranteed memory, in MiB. */
  memory: DatabaseServerPlan["memory"];
  /** Guaranteed storage, in GiB. */
  storage: DatabaseServerPlan["storage"];
  /** Bandwidth limit in MB/s, or `null` when unlimited. */
  netrate: DatabaseServerPlan["netrate"];
  /** List price, in cents. */
  price: DatabaseServerPlan["price"];
  /** Price after the best active discount, in cents. Falls back to `price`. */
  purchasePrice?: number;
  isAvailable: boolean;
};

/**
 * `Product` and `Offer` structured data for the plans rendered by `OfferRow`.
 *
 * The plans are the only thing on the marketing site with a price, a spec and
 * stock state, and until now none of it was machine-readable — the site earned
 * no rich results at all. This reads the same rows the cards render, so the
 * structured data cannot drift from what a visitor sees.
 *
 * Wrapped in an `ItemList` because the page lists several products rather than
 * being about one; that is the shape Google documents for a listing page.
 *
 * `Offer.url` is deliberately absent. It should point at the page where a plan
 * can be bought, and the only such URL is `/checkout/<id>`, which `robots.txt`
 * disallows — pointing structured data at a blocked URL is worse than omitting
 * an optional field.
 */
export async function OffersJsonLd({ plans }: { plans: OfferJsonLdPlan[] }) {
  const formatter = await getFormatter();

  const itemList: WithContext<ItemList> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: plans.map((plan, index) => {
      // Prices are quoted to a crawler as a plain decimal, never through the
      // locale formatter — `4,99` is not a number in JSON-LD.
      const price = ((plan.purchasePrice ?? plan.price) / 100).toFixed(2);

      // Formatted with the same helpers as the card, so the two agree in every
      // locale. Structured data that disagrees with the visible page is
      // ignored, and inventing a second set of units is how that starts.
      const memory = formatBytes(plan.memory * 1024 * 1024, { formatter });
      const storage = `${formatBytes(plan.storage * 1024 * 1024 * 1024, {
        formatter,
      })} NVMe SSD`;

      // `value` is the bare measurement, for `additionalProperty` where the
      // `name` already supplies the unit. `label` restates it for the prose
      // description, where nothing else says what the number counts.
      const specifications = [
        {
          name: "vCores",
          value: String(plan.cores),
          label: `${plan.cores} vCPU`,
        },
        { name: "Memory", value: memory, label: `${memory} RAM` },
        { name: "Storage", value: storage, label: storage },
        ...(plan.netrate
          ? [
              {
                name: "Bandwidth",
                value: formatBits(plan.netrate * 1e6 * 8, {
                  formatter,
                  perSecond: true,
                  base: 1000,
                  unit: "gigabit",
                }),
              },
            ].map(({ name, value }) => ({ name, value, label: value }))
          : []),
      ];

      return {
        "@type": "ListItem" as const,
        position: index + 1,
        item: {
          "@type": "Product" as const,
          "@id": `${PUBLIC_DOMAIN}/#plan-${plan.id}`,
          name: plan.name,
          description: specifications.map(({ label }) => label).join(" · "),
          category: "VPS Hosting",
          brand: { "@id": ORGANIZATION_ID },
          additionalProperty: specifications.map(({ name, value }) => ({
            "@type": "PropertyValue" as const,
            name,
            value,
          })),
          offers: {
            "@type": "Offer" as const,
            price,
            priceCurrency: CURRENCY,
            availability: plan.isAvailable
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            seller: { "@id": ORGANIZATION_ID },
            // A plan is a monthly subscription, not a one-off purchase. Without
            // the reference quantity a crawler reads the price as the total.
            priceSpecification: {
              "@type": "UnitPriceSpecification" as const,
              price,
              priceCurrency: CURRENCY,
              referenceQuantity: {
                "@type": "QuantitativeValue" as const,
                value: 1,
                // UN/CEFACT code for "month".
                unitCode: "MON",
              },
            },
          },
        },
      };
    }),
  };

  return <JsonLd schema={itemList} />;
}
