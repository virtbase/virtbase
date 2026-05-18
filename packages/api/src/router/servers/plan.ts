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

import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq } from "@virtbase/db";
import {
  getPlansWithAvailability,
  pickBestDiscount,
} from "@virtbase/db/queries";
import {
  discounts,
  serverPlanPrices,
  serverPlans,
  servers,
} from "@virtbase/db/schema";
import {
  GetServerPlanInputSchema,
  GetServerPlanOutputSchema,
} from "@virtbase/validators/server";
import { serverProcedure } from "../../trpc";

// Pro-rata math reference period. Postgres `INTERVAL '1 month'` is variable
// length (28-31 days), but for charge calculations we use a flat 30-day
// month so the displayed pro-rata charge is stable regardless of the
// calendar month the upgrade lands in.
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Stripe's minimum charge for EUR is 50 cents. Pro-rata charges below
// that get bumped up so the upgrade still goes through; the customer
// pays at most ~50 cents more than the strict pro-rata in edge cases
// (e.g. upgrading a few days before renewal with a small price delta).
const STRIPE_MIN_CHARGE_EUR_CENTS = 50;

export const serversPlanRouter = {
  get: serverProcedure
    .input(GetServerPlanInputSchema)
    .output(GetServerPlanOutputSchema)
    .query(async ({ ctx }) => {
      const { db, server } = ctx;

      const current = await db
        .select({
          id: serverPlans.id,
          storage: serverPlans.storage,
          proxmoxNodeGroupId: serverPlans.proxmoxNodeGroupId,
          // Pro-rata depends on how much of the current term is left.
          terminatesAt: servers.terminatesAt,
          // The customer's locked-in renewal price drives both the
          // "current plan" row's display price and the pro-rata baseline
          // for every other row.
          lockedRenewalPrice: serverPlanPrices.renewalPrice,
          lockedRenewalDiscount: {
            id: discounts.id,
            name: discounts.name,
            type: discounts.type,
            amount: discounts.amount,
          },
        })
        .from(servers)
        .where(eq(servers.id, server.id))
        .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
        .innerJoin(
          serverPlanPrices,
          eq(servers.serverPlanPriceId, serverPlanPrices.id),
        )
        // `renewalDiscountId` is nullable, so left-join so a server without
        // a renewal discount still returns a row (with null discount cols).
        .leftJoin(
          discounts,
          eq(serverPlanPrices.renewalDiscountId, discounts.id),
        )
        .limit(1)
        .then(([row]) => row);

      if (!current) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const rawLockedDiscount = current.lockedRenewalDiscount;
      const lockedRenewalDiscount =
        rawLockedDiscount?.id != null ? rawLockedDiscount : null;

      const remainingMs = current.terminatesAt
        ? Math.max(0, current.terminatesAt.getTime() - Date.now())
        : 0;
      const proRataFraction = Math.max(0, Math.min(1, remainingMs / MONTH_MS));

      const plans = await getPlansWithAvailability(
        eq(serverPlans.proxmoxNodeGroupId, current.proxmoxNodeGroupId),
      );

      return {
        plans: plans.map((plan) => {
          const isCurrent = plan.id === current.id;
          const discountsOnPlan = plan.activeDiscounts ?? [];
          const { discount: purchaseDiscount, finalPrice: purchasePrice } =
            pickBestDiscount(plan.price, discountsOnPlan, "purchase");
          const {
            discount: freshRenewalDiscount,
            finalPrice: freshRenewalPrice,
          } = pickBestDiscount(plan.price, discountsOnPlan, "renewal");

          // Current plan row reflects what the customer is locked into. Any
          // other plan reflects the freshly evaluated catalog price, since
          // upgrading will create a new price row.
          const renewalPrice = isCurrent
            ? current.lockedRenewalPrice
            : freshRenewalPrice;
          const renewalDiscount = isCurrent
            ? lockedRenewalDiscount
            : freshRenewalDiscount;

          let upgradePrice: number | null;
          if (isCurrent) {
            upgradePrice = null;
          } else {
            // Compare against the customer's locked-in renewal price so the
            // pro-rata reflects what the customer actually pays right now
            // (including any custom discount carried forward).
            const diff = Math.max(
              0,
              freshRenewalPrice - current.lockedRenewalPrice,
            );
            const raw = Math.floor(diff * proRataFraction);
            // Clamp small but non-zero pro-rata to Stripe's EUR minimum so
            // the upgrade can still be processed.
            upgradePrice =
              raw > 0 && raw < STRIPE_MIN_CHARGE_EUR_CENTS
                ? STRIPE_MIN_CHARGE_EUR_CENTS
                : raw;
          }

          return {
            id: plan.id,
            name: plan.name,
            cores: plan.cores,
            memory: plan.memory,
            storage: plan.storage,
            netrate: plan.netrate,
            price: plan.price,
            current: isCurrent,
            available: plan.isAvailable,
            purchase_price: purchasePrice,
            renewal_price: renewalPrice,
            upgrade_price: upgradePrice,
            purchase_discount:
              purchaseDiscount?.id != null
                ? {
                    id: purchaseDiscount.id,
                    name: purchaseDiscount.name,
                    type: purchaseDiscount.type,
                    amount: purchaseDiscount.amount,
                  }
                : null,
            renewal_discount:
              renewalDiscount?.id != null
                ? {
                    id: renewalDiscount.id,
                    name: renewalDiscount.name,
                    type: renewalDiscount.type,
                    amount: renewalDiscount.amount,
                  }
                : null,
          };
        }),
      };
    }),
} satisfies TRPCRouterRecord;
