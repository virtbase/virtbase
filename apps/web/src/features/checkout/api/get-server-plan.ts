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

import { db } from "@virtbase/db/client";
import { pickBestDiscount } from "@virtbase/db/queries";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

export const getServerPlan = cache(async (id: string) => {
  "use cache";

  cacheTag("checkout");
  cacheLife("max");

  const plan = await db.query.serverPlans.findFirst({
    where: { id },
    with: {
      discounts: {
        where: {
          AND: [
            { active: true },
            {
              RAW: (t, { sql }) =>
                sql`${t.startsAt} IS NULL OR ${t.startsAt} <= now()`,
            },
            {
              RAW: (t, { sql }) =>
                sql`${t.endsAt} IS NULL OR ${t.endsAt} >= now()`,
            },
          ],
        },
      },
    },
  });

  if (!plan) {
    return null;
  }

  // Pick only the best (lowest resulting price) discount per side. The DB
  // can return multiple active discounts attached to the plan; the UI only
  // ever surfaces one.
  const { discount: purchaseDiscount, finalPrice: purchasePrice } =
    pickBestDiscount(plan.price, plan.discounts, "purchase");
  const { discount: renewalDiscount, finalPrice: renewalPrice } =
    pickBestDiscount(plan.price, plan.discounts, "renewal");

  return {
    ...plan,
    purchasePrice,
    renewalPrice,
    purchaseDiscount,
    renewalDiscount,
  };
});
