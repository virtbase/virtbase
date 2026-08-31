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

import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideServer } from "@virtbase/ui/icons";
import { useExtracted, useFormatter } from "next-intl";
import { ItemRow } from "@/features/account/components/item-row";
import { formatDiscountLabel } from "@/features/checkout/utils/format-discount";
import type { Plan } from "./plan-context";
import { PlanSpecs } from "./plan-specs";

interface PlanListProps {
  plans: Plan[];
  currentPlan: Plan | null;
  /** "Upgrade" on a row other than the current one. */
  onUpgrade: (planId: string) => void;
  /** "Extend" on the current row. */
  onExtend: (planId: string) => void;
  disabled?: boolean;
}

/**
 * Every plan this server could be on, as one list of rows.
 *
 * ## Nothing is selected, everything is pressed
 *
 * There is no radio and no highlighted row. A plan is not a setting the page
 * holds on the customer's behalf until they submit something - it is a
 * purchase, and the two purchases available are named on the rows themselves:
 * "Extend" on the plan the server is already on, "Upgrade" on every other one.
 * Both open the same dialog, which is where the price is stated and consent is
 * asked for.
 *
 * ## Reading down a column
 *
 * The monthly price sits in the same place on every row, in tabular figures,
 * because that is the number rows are compared by. The pro-rata charge varies
 * with how much of the term is left, so it is the quieter second line and gets
 * its full billing in the dialog, where it is what is actually about to be
 * paid.
 *
 * A plan that cannot be ordered keeps its row, its price and its button. The
 * button is disabled and the reason is written beside it: a row that vanishes
 * teaches the customer nothing, and one that silently does nothing when
 * pressed teaches them less.
 */
export function PlanList({
  plans,
  currentPlan,
  onUpgrade,
  onExtend,
  disabled,
}: PlanListProps) {
  const t = useExtracted();

  if (!plans.length) {
    return (
      <Empty className="border" data-testid="empty-plans">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideServer aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No plans available")}</EmptyTitle>
          <EmptyDescription>
            {t("There is nothing to extend or upgrade to right now.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div data-testid="plan-list">
      {plans.map((plan) => (
        <PlanItem
          key={plan.id}
          plan={plan}
          currentPlan={currentPlan}
          onUpgrade={onUpgrade}
          onExtend={onExtend}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function PlanItem({
  plan,
  currentPlan,
  onUpgrade,
  onExtend,
  disabled,
}: {
  plan: Plan;
  currentPlan: Plan | null;
} & Pick<PlanListProps, "onUpgrade" | "onExtend" | "disabled">) {
  const t = useExtracted();
  const format = useFormatter();

  const money = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR" });

  const isCurrent = plan.current;

  // Why the button is dead, in as few words as fit beside it. The dialog says
  // the same thing in a sentence; the row only has to stop the press being a
  // mystery.
  const blockedReason = (() => {
    if (isCurrent) return null;
    if (currentPlan && plan.storage < currentPlan.storage) {
      return t("Less storage than your plan");
    }
    if (!plan.available) return t("Sold out");

    return null;
  })();

  const renewalPrice = plan.renewal_price ?? plan.price;
  const hasDiscount =
    plan.renewal_discount != null && renewalPrice < plan.price;
  const upgradeCharge = isCurrent ? null : (plan.upgrade_price ?? null);

  return (
    <ItemRow
      data-testid="plan-row"
      data-plan={plan.id}
      data-current={isCurrent || undefined}
      icon={<LucideServer className="size-6 shrink-0" aria-hidden="true" />}
      rightSide={
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-1 lg:items-end">
            <p className="whitespace-nowrap text-sm tabular-nums">
              {hasDiscount && (
                <span className="mr-1.5 text-muted-foreground line-through">
                  {money(plan.price)}
                </span>
              )}
              {t("{price} / month", { price: money(renewalPrice) })}
            </p>
            {blockedReason ? (
              <p
                className="text-muted-foreground text-sm leading-none"
                data-testid="plan-blocked-reason"
              >
                {blockedReason}
              </p>
            ) : (
              upgradeCharge != null && (
                <p className="whitespace-nowrap text-muted-foreground text-sm leading-none">
                  {t("{price} today", { price: money(upgradeCharge) })}
                </p>
              )
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={disabled || blockedReason !== null}
            data-testid={isCurrent ? "extend-plan" : "upgrade-plan"}
            onClick={() => (isCurrent ? onExtend(plan.id) : onUpgrade(plan.id))}
          >
            {isCurrent ? t("Extend") : t("Upgrade")}
          </Button>
        </div>
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="truncate font-medium text-sm">{plan.name}</p>
        {isCurrent && (
          // Outline rather than filled: this marker is on the page every time
          // the customer opens it, and a solid chip that never goes away is
          // one they stop seeing.
          <Badge variant="outline" data-testid="current-plan-badge">
            {t("Current plan")}
          </Badge>
        )}
        {hasDiscount && plan.renewal_discount && (
          <Badge variant="secondary" data-testid="plan-discount">
            {formatDiscountLabel(plan.renewal_discount, format)}
          </Badge>
        )}
      </div>
      <PlanSpecs
        plan={plan}
        className="text-muted-foreground text-sm leading-none"
      />
    </ItemRow>
  );
}
