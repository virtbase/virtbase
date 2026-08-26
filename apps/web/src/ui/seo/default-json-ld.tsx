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

import { APP_NAME, PUBLIC_DOMAIN, SUPPORT_EMAIL } from "@virtbase/utils";
import type { Organization, WebSite } from "schema-dts";
import { locales } from "@/i18n/config";
import { SOCIALS } from "@/lib/socials";
import JsonLd from "./json-ld";

/**
 * Stable node identifiers for the site-wide graph.
 *
 * Without an `@id` a node cannot be referenced, so every other piece of
 * structured data on the site has to restate the publisher inline and a crawler
 * has no way to know the two describe the same company. Anything that names
 * Virtbase as a brand or seller — `OffersJsonLd`, for one — points here instead.
 */
export const ORGANIZATION_ID = `${PUBLIC_DOMAIN}/#organization`;
export const WEBSITE_ID = `${PUBLIC_DOMAIN}/#website`;

export function DefaultJsonLd() {
  const organization: Organization = {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    url: PUBLIC_DOMAIN,
    logo: `${PUBLIC_DOMAIN}/web-app-manifest-512x512.png`,
    image: `${PUBLIC_DOMAIN}/web-app-manifest-512x512.png`,
    email: SUPPORT_EMAIL,
    name: APP_NAME,
    // "Virtbase" collides with a crowded set of indexed entities — Virtuoso,
    // Virtusa, VigiBase, virt-manager among them — so spell out the names this
    // company is actually known by rather than leaving the match to string
    // similarity.
    alternateName: [`${APP_NAME} Hosting`, "BeastHost UG"],
    description: `${APP_NAME} is your provider for secure server hosting. Maximum performance with minimal effort.`,
    legalName: "BeastHost UG (haftungsbeschränkt)",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Lambarenestraße 21A",
      addressLocality: "Lichtenstein/Sa.",
      addressRegion: "Saxony",
      addressCountry: "DE",
      postalCode: "09350",
    },
    vatID: "DE450878664",
    taxID: "227/106/00329",
    contactPoint: {
      "@type": "ContactPoint",
      email: SUPPORT_EMAIL,
    },
    iso6523Code: "0060:316427416",
    foundingDate: "2024-12-18",
    founder: {
      "@type": "Person",
      name: "Janic Bellmann",
      familyName: "Bellmann",
      givenName: "Janic",
      jobTitle: "CEO",
      url: "https://janic.dev",
    },
    numberOfEmployees: {
      "@type": "QuantitativeValue",
      minValue: 1,
      maxValue: 10,
    },
    sameAs: SOCIALS.map(({ href }) => href),
  };

  const website: WebSite = {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: PUBLIC_DOMAIN,
    name: APP_NAME,
    // Google reads the site name for search results from the `WebSite` node,
    // not the `Organization` one, so the disambiguating names have to be on
    // both.
    alternateName: [`${APP_NAME} Hosting`, "BeastHost UG"],
    publisher: { "@id": ORGANIZATION_ID },
    inLanguage: [...locales],
  };

  return (
    <JsonLd
      schema={{
        "@context": "https://schema.org",
        "@graph": [organization, website],
      }}
    />
  );
}
