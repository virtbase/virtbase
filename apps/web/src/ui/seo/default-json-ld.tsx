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

import { PUBLIC_DOMAIN } from "@virtbase/utils";
import type { Organization, WithContext } from "schema-dts";
import { SOCIALS } from "@/lib/socials";
import JsonLd from "./json-ld";

export function DefaultJsonLd() {
  const organization: WithContext<Organization> = {
    "@type": "Organization",
    "@context": "https://schema.org",
    url: PUBLIC_DOMAIN,
    logo: `${PUBLIC_DOMAIN}/web-app-manifest-512x512.png`,
    image: `${PUBLIC_DOMAIN}/web-app-manifest-512x512.png`,
    email: "support@virtbase.com",
    name: "Virtbase",
    alternateName: "Virtbase.com",
    description:
      "Virtbase is your provider for secure server hosting. Maximum performance with minimal effort.",
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
      email: "support@virtbase.com",
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

  return (
    <JsonLd
      schema={{
        "@context": "https://schema.org",
        "@graph": [organization],
      }}
    />
  );
}
