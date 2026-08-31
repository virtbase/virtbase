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

"use client";

import { cn } from "@virtbase/ui";
import { Badge } from "@virtbase/ui/badge";
import { LucideArrowRight } from "@virtbase/ui/icons";
import { useExtracted, useFormatter } from "next-intl";
import { formatDiscountLabel } from "@/features/checkout/utils/format-discount";
import type { Plan, PlanAction } from "./plan-context";
import { PlanSpecs } from "./plan-specs";

/**
 * The two numbers an order comes down to, in cents.
 *
 * One function rather than the same conditional in the summary, the confirm
 * button's label and the disabled check: those three disagreeing about what is
 * being charged is the kind of drift a customer finds on their statement.
 */
export function getPlanCharge({
  mode,
  plan,
}: {
  mode: PlanAction["mode"];
  plan: Plan;
}) {
  const catalogPrice = plan.price;
  const renewalPrice = plan.renewal_price ?? catalogPrice;
  const discount = plan.renewal_discount ?? null;

  return {
    /** What is charged the moment the customer confirms. */
    dueToday: "extend" === mode ? renewalPrice : (plan.upgrade_price ?? 0),
    /** What every renewal after this one costs. */
    renewalPrice,
    catalogPrice,
    discount,
    hasDiscount: discount != null && renewalPrice < catalogPrice,
  };
}

/**
 * What the customer is about to buy, above what it costs.
 *
 * Ordered the way the question is asked: which plan, what it gets them, what
 * leaves their account today, and only then what it settles into afterwards.
 * The amount due today is the largest thing in the dialog because it is the
 * only figure that is charged the moment they press the button.
 */
export function PlanSummary({
  mode,
  plan,
  currentPlan,
}: {
  mode: PlanAction["mode"];
  plan: Plan;
  currentPlan: Plan | null;
}) {
  const t = useExtracted();
  const format = useFormatter();

  const { dueToday, renewalPrice, catalogPrice, discount, hasDiscount } =
    getPlanCharge({ mode, plan });

  const money = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR" });

  const isUpgrade = "upgrade" === mode;

  return (
    <div className="flex flex-col gap-4" data-testid="plan-order-summary">
      <div className="flex flex-col gap-3">
        {isUpgrade && currentPlan ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="truncate font-mono text-muted-foreground">
              {currentPlan.name}
            </span>
            <LucideArrowRight
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="truncate font-medium font-mono text-foreground">
              {plan.name}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium font-mono text-foreground">
              {plan.name}
            </span>
            {hasDiscount && discount && (
              <Badge
                variant="destructive"
                className="px-1.5 py-0.5 text-[0.5rem] uppercase tabular-nums leading-none"
              >
                {formatDiscountLabel(discount, format)}
              </Badge>
            )}
          </div>
        )}
        <PlanSpecs plan={plan} />
      </div>

      <dl className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground text-sm">{t("Due today")}</dt>
          <dd className="flex items-baseline gap-2">
            {hasDiscount && !isUpgrade && (
              <span className="text-muted-foreground text-sm tabular-nums line-through">
                {money(catalogPrice)}
              </span>
            )}
            <span
              className={cn(
                // `xl` is what the checkout's own order summary and offer
                // cards set money at. A `2xl` here made the figure inside a
                // dialog louder than the same figure on the page that sells
                // the plan, and louder than the dialog's own title.
                "font-semibold text-xl tabular-nums leading-none",
                hasDiscount && !isUpgrade && "text-destructive",
              )}
              data-testid="due-today"
            >
              {money(dueToday)}
            </span>
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground text-sm">
            {isUpgrade ? t("From your next renewal") : t("Renews at")}
          </dt>
          <dd className="text-sm tabular-nums">
            {t("{price} / month", { price: money(renewalPrice) })}
          </dd>
        </div>
      </dl>

      <p className="text-muted-foreground text-sm">
        {isUpgrade
          ? t("Only the difference is charged today. Your term is unchanged.")
          : t("Your current plan will be extended by one month.")}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("Incl. statutory VAT, if applicable")}
      </p>
    </div>
  );
}
