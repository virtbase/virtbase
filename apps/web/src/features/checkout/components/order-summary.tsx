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
import {
  LucideCpu,
  LucideDownloadCloud,
  LucideGauge,
  LucideHardDrive,
  LucideMapPin,
  LucideMemoryStick,
  LucideNetwork,
} from "@virtbase/ui/icons";
import { formatBits, formatBytes } from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";

export function OrderSummary({
  plan,
  datacenter,
}: {
  plan: Pick<
    DatabaseServerPlan,
    "id" | "name" | "price" | "cores" | "memory" | "storage" | "netrate"
  >;
  datacenter: Pick<DatabaseDatacenter, "id" | "name" | "country">;
}) {
  const t = useExtracted();
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <h3 className="py-1 font-mono font-semibold text-foreground text-xl leading-none">
          {plan.name}
        </h3>
        <span className="text-muted-foreground text-sm">
          {t("Order Summary")}
        </span>
      </div>
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
              {/* Convert MiB to bytes */}
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
              <p>
                {plan.netrate
                  ? formatBits(plan.netrate * 1e6 * 8, {
                      formatter: format,
                      perSecond: true,
                      base: 1000,
                      unit: "gigabit",
                    })
                  : "Shared"}{" "}
                Uplink
              </p>
            </li>
            <li className="flex items-center gap-2 text-foreground">
              <LucideDownloadCloud
                strokeWidth={1.5}
                className="size-4 shrink-0"
                aria-hidden="true"
              />
              <p>{t("Unlimited traffic")}</p>
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
        <div className="mt-1 flex items-center gap-1.5 border-t pt-4">
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
    </div>
  );
}
