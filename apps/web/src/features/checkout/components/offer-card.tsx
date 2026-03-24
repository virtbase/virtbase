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

import type {
  DatabaseDatacenter,
  DatabaseServerPlan,
} from "@virtbase/db/schema";
import { cn } from "@virtbase/ui";
import { Button } from "@virtbase/ui/button";
import {
  LucideCpu,
  LucideDownloadCloud,
  LucideGauge,
  LucideHardDrive,
  LucideMapPin,
  LucideMemoryStick,
  LucideNetwork,
} from "@virtbase/ui/icons";
import { Separator } from "@virtbase/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@virtbase/ui/tooltip";
import { formatBits, formatBytes } from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";
import type React from "react";
import { IntlLink } from "@/i18n/navigation.public";

type OfferCardProps = React.ComponentProps<"div"> & {
  plan: Pick<
    DatabaseServerPlan,
    "id" | "name" | "price" | "cores" | "memory" | "storage" | "netrate"
  > & {
    isAvailable: boolean;
  };
  datacenter: Pick<DatabaseDatacenter, "id" | "name" | "country">;
};

export function OfferCard({
  plan,
  datacenter,
  className,
  ...props
}: OfferCardProps) {
  const t = useExtracted();
  const format = useFormatter();

  return (
    <div
      className={cn(
        "relative top-0 flex h-full flex-col bg-background",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-6 p-5 pb-3">
        <div className="pb-0">
          <div className="flex items-center gap-2">
            <h2 className="py-1 font-mono font-semibold text-foreground text-xl leading-none">
              {plan.name}
            </h2>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="font-medium text-base tabular-nums">
              {format.number(plan.price / 100, {
                style: "currency",
                currency: "EUR",
              })}
            </span>
            <span className="text-muted-foreground text-sm">
              {t("per month")}
            </span>
          </div>
        </div>
        <Separator />
        <div className="flex flex-col gap-3 text-sm">
          <div className="relative flex flex-col">
            <ul className="flex flex-col gap-2.5">
              <li className="flex items-center gap-2 text-foreground">
                <LucideCpu
                  strokeWidth={1.5}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  {t(
                    "{cores, plural, =0 {# vCores} =1 {# vCore} other {# vCores}}",
                    {
                      cores: plan.cores,
                    },
                  )}
                </p>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <LucideMemoryStick
                  strokeWidth={1.5}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  {formatBytes(plan.memory * 1024 * 1024, {
                    formatter: format,
                  })}{" "}
                  RAM
                </p>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <LucideHardDrive
                  strokeWidth={1.5}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                {/* Convert GiB to bytes */}
                <p>
                  {formatBytes(plan.storage * 1024 * 1024 * 1024, {
                    formatter: format,
                  })}{" "}
                  NVMe SSD
                </p>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <LucideNetwork
                  strokeWidth={1.5}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>{t("1 IPv4 + IPv6 /64 Subnet")}</p>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <LucideGauge
                  strokeWidth={1.5}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <p className="cursor-help underline decoration-dotted underline-offset-2">
                        {plan.netrate
                          ? formatBits(plan.netrate * 1e6 * 8, {
                              formatter: format,
                              perSecond: true,
                              base: 1000,
                              unit: "gigabit",
                            })
                          : t("Shared")}{" "}
                        Uplink
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs px-4 py-2 text-center text-sm">
                      {t(
                        "Shared-Uplink - the maximum possible bandwidth is shared with other customers.",
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <LucideDownloadCloud
                  strokeWidth={1.5}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <p className="cursor-help underline decoration-dotted underline-offset-2">
                        {t("Unlimited traffic")}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs px-4 py-2 text-center text-sm">
                      {t(
                        "Traffic after fair-use principle. Temporary throttling at excessive long-term usage.",
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <LucideMapPin
                  strokeWidth={1.5}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  {datacenter.name}, {datacenter.country}
                </p>
              </li>
            </ul>
          </div>
        </div>
        <div className="pb-3">
          <Button
            className="w-full"
            size="lg"
            asChild={plan.isAvailable}
            disabled={!plan.isAvailable}
          >
            {plan.isAvailable ? (
              <IntlLink
                href={`/checkout/${plan.id}`}
                prefetch={false}
                aria-label={t("Configure {name} now", {
                  name: plan.name,
                })}
              >
                {t("Configure now")}
              </IntlLink>
            ) : (
              t("Sold out")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
