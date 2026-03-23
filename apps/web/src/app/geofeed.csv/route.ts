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

import { captureException } from "@sentry/nextjs";
import { asc, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { subnets } from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

/**
 * @see https://datatracker.ietf.org/doc/html/rfc8805#name-alpha2code-previously-count
 */
const COUNTRY_CODE = "DE" as const;

/**
 * @see https://datatracker.ietf.org/doc/html/rfc8805#name-region
 */
const REGION_CODE = "DE-SN" as const;

/**
 * @see https://datatracker.ietf.org/doc/html/rfc8805#name-city
 */
const CITY = "Lichtenstein/Sachsen" as const;

/**
 * @see https://datatracker.ietf.org/doc/html/rfc8805#name-postal-code
 */
const POSTAL_CODE = "09350" as const;

const HEADER =
  "# Self-published geofeed as defined in datatracker.ietf.org/doc/html/rfc8805\r\n# Virtbase Geofeed";

/**
 * @see https://datatracker.ietf.org/doc/html/rfc8805#name-specification
 */
export const contentType = "text/csv; charset=utf-8";

/**
 * Get all currently registered parent subnets.
 *
 * Entries are sorted in the following order:
 * - Family (IPv4 first, then IPv6)
 * - CIDR (smallest to largest)
 */
const getActiveSubnets = cache(async () => {
  "use cache";

  cacheLife("hours");
  cacheTag("geofeed");

  try {
    const activeSubnets = await db.transaction(
      async (tx) => {
        return tx
          .select({
            cidr: subnets.cidr,
          })
          .from(subnets)
          .where(
            // Subnet is not a child subnet
            isNull(subnets.parentId),
          )
          .orderBy(
            asc(sql<number>`family(${subnets.cidr})`),
            asc(subnets.cidr),
          );
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    return activeSubnets;
  } catch (error) {
    captureException(error);

    return [];
  }
});

async function handler() {
  const activeSubnets = await getActiveSubnets();

  const contents = activeSubnets.map((subnet) => {
    return `${subnet.cidr},${COUNTRY_CODE},${REGION_CODE},${CITY},${POSTAL_CODE}`;
  });

  return new Response([HEADER, ...contents].join("\r\n"), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}

export { handler as GET };
