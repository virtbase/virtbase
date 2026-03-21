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

import { cn } from "@virtbase/ui";
import { LucideDollarSign, LucideServer, LucideUser } from "@virtbase/ui/icons";
import { useExtracted } from "next-intl";
import type { getActivityStats } from "../../api/dashboard/get-activity-stats";
import { StatsCard } from "./stats-card";

export function ActivityStatsRow({
  promise,
  className,
  ...props
}: {
  promise: ReturnType<typeof getActivityStats>;
} & React.ComponentProps<"div">) {
  const t = useExtracted();

  return (
    <div
      className={cn("grid grid-cols-1 gap-2 xl:grid-cols-3", className)}
      {...props}
    >
      <StatsCard
        title={t("Active Servers")}
        promise={promise}
        accessorKey="activeServersCount"
        icon={<LucideServer className="size-4" />}
        description={t("The number of currently active servers")}
      />
      <StatsCard
        title={t("Customers")}
        promise={promise}
        accessorKey="customersCount"
        icon={<LucideUser className="size-4" />}
        description={t("The number of registered customers")}
      />
      <StatsCard
        title={t("Monthly Revenue")}
        promise={promise}
        accessorKey="monthlyRevenue"
        icon={<LucideDollarSign className="size-4" />}
        description={t("Revenue in the last month")}
        formatOptions={{
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }}
      />
    </div>
  );
}
