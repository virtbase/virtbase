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

import { getPlansWithAvailability } from "@virtbase/db/queries";
import { GetOfferListOutputSchema } from "@virtbase/validators";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const publicRouter = createTRPCRouter({
  getOfferList: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/offer-list",
        tags: ["Offers"],
        summary: "List offers",
        description: "Returns a list of offers with their details.",
        contentTypes: ["application/json"],
        protect: false,
      },
      ratelimit: {
        fingerprint: ({ userId, defaultFingerprint }) =>
          `get-offer-list:${userId || defaultFingerprint}`,
        requests: 10,
        seconds: "1 m",
      },
    })
    .output(GetOfferListOutputSchema)
    .query(async () => {
      const offers = await getPlansWithAvailability();
      return offers.map((offer) => ({
        id: offer.id,
        name: offer.name,
        cores: offer.cores,
        memory: offer.memory,
        storage: offer.storage,
        netrate: offer.netrate,
        price: offer.price,
        is_available: offer.isAvailable,
      }));
    }),
});
