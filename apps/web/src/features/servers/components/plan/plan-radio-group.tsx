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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@virtbase/ui/field";
import {
  LucideCpu,
  LucideHardDrive,
  LucideMemoryStick,
  LucideNetwork,
} from "@virtbase/ui/icons/index";
import { RadioGroup, RadioGroupItem } from "@virtbase/ui/radio-group";
import { formatBits, formatBytes } from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";
import { formatDiscountLabel } from "@/features/checkout/utils/format-discount";

interface PlanRadioGroupProps extends React.ComponentProps<typeof RadioGroup> {
  currentPlan?: {
    storage: number;
  } | null;
  plans: {
    id: string;
    name: string;
    price: number;
    cores: number;
    memory: number;
    storage: number;
    netrate: number | null;
    current: boolean;
    available: boolean;
    /**
     * Renewal price the customer pays on every renewal once locked in to
     * this plan. For the current plan this is the price already locked in
     * on `server_plan_prices` (preserving any custom/discounted price);
     * for upgrade targets it's the freshly evaluated catalog renewal price.
     */
    renewal_price?: number;
    renewal_discount?: {
      type: "PERCENTAGE" | "FIXED";
      amount: number;
    } | null;
    /**
     * Pro-rata amount the customer pays today to upgrade to this plan
     * (in cents). `null` for the current plan (no upgrade applies). When
     * set, it's the headline charge the customer sees — the term length
     * does not change on upgrade.
     */
    upgrade_price?: number | null;
  }[];
}

export function PlanRadioGroup({
  currentPlan,
  plans,
  ...props
}: PlanRadioGroupProps) {
  const t = useExtracted();
  const format = useFormatter();

  const display = [
    {
      accessorKey: "cores",
      render: (value: number) =>
        t("{cores, plural, =0 {# vCores} =1 {# vCore} other {# vCores}}", {
          cores: value,
        }),
      icon: LucideCpu,
    },
    {
      accessorKey: "memory",
      render: (value: number) =>
        t(`{memory} RAM`, {
          memory: formatBytes(value * 1024 * 1024, { formatter: format }),
        }),
      icon: LucideMemoryStick,
    },
    {
      accessorKey: "storage",
      render: (value: number) =>
        t(`{storage} NVMe SSD`, {
          storage: formatBytes(value * 1024 * 1024 * 1024, {
            formatter: format,
          }),
        }),
      icon: LucideHardDrive,
    },
    {
      accessorKey: "netrate",
      render: (value: number) =>
        formatBits(value * 1e6 * 8, {
          formatter: format,
          perSecond: true,
          base: 1000,
          unit: "gigabit",
        }),
      icon: LucideNetwork,
    },
  ] as const;

  return (
    <RadioGroup {...props}>
      {plans.map((plan) => {
        const renewalPrice = plan.renewal_price ?? plan.price;
        const hasDiscount =
          plan.renewal_discount != null && renewalPrice < plan.price;
        // Non-current rows are upgrade targets and bill a pro-rata charge
        // today; the renewal price applies from the next renewal onwards.
        // Surface the upgrade charge prominently so the customer sees what
        // they'll actually pay right now.
        const isUpgradeTarget = !plan.current && plan.upgrade_price != null;

        return (
          <FieldLabel key={plan.id} htmlFor={plan.id}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>
                  <span>{plan.name}</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                    {isUpgradeTarget && plan.upgrade_price != null ? (
                      <>
                        <span className="font-medium text-foreground tabular-nums">
                          {t("{price} today", {
                            price: format.number(plan.upgrade_price / 100, {
                              style: "currency",
                              currency: "EUR",
                            }),
                          })}
                        </span>
                        <span className="tabular-nums">
                          {t("then {price} / month", {
                            price: format.number(renewalPrice / 100, {
                              style: "currency",
                              currency: "EUR",
                            }),
                          })}
                        </span>
                      </>
                    ) : (
                      <>
                        {hasDiscount && (
                          <span className="tabular-nums line-through">
                            {format.number(plan.price / 100, {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </span>
                        )}
                        <span
                          className={cn(
                            "tabular-nums",
                            hasDiscount && "font-medium text-destructive",
                          )}
                        >
                          {t("{price} / month", {
                            price: format.number(renewalPrice / 100, {
                              style: "currency",
                              currency: "EUR",
                            }),
                          })}
                        </span>
                      </>
                    )}
                  </span>
                  {hasDiscount && plan.renewal_discount && (
                    <Badge
                      variant="destructive"
                      className="px-1.5 py-0.5 text-[0.5rem] uppercase tabular-nums leading-none"
                    >
                      {formatDiscountLabel(plan.renewal_discount, format)}
                    </Badge>
                  )}
                  {/** Don't show sold out for current user plan (since it can still be extended) */}
                  {!plan.available && (!currentPlan || !plan.current) && (
                    <span className="text-destructive text-xs">
                      {t("Sold out")}
                    </span>
                  )}
                </FieldTitle>
                <FieldDescription>
                  <span className="flex flex-wrap items-center gap-2">
                    {display
                      .filter((item) => plan[item.accessorKey] !== null)
                      .map((item) => (
                        <span
                          key={item.accessorKey}
                          className="flex items-center gap-1"
                        >
                          <item.icon
                            className="size-4 shrink-0"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          {/** @ts-expect-error - item.accessorKey can not be null */}
                          <span>{item.render(plan[item.accessorKey])}</span>
                        </span>
                      ))}
                  </span>
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem
                id={plan.id}
                value={plan.id}
                disabled={
                  // New plan has smaller storage
                  (currentPlan && plan.storage < currentPlan.storage) ||
                  // Plan is not the current plan and is not available
                  (!plan.current && !plan.available) ||
                  // Current user has no plan and plan is not available
                  (!currentPlan && !plan.available)
                }
              />
            </Field>
          </FieldLabel>
        );
      })}
    </RadioGroup>
  );
}
