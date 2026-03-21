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

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@virtbase/ui/breadcrumb";
import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { getActivityStats } from "@/features/admin/api/dashboard/get-activity-stats";
import { ActivityStatsRow } from "@/features/admin/components/dashboard/activity-stats-row";
import { CustomersOverTimeCard } from "@/features/admin/components/dashboard/customers-over-time-card";
import { LatestCustomersCard } from "@/features/admin/components/dashboard/latest-customers-card";
import { LatestServersCard } from "@/features/admin/components/dashboard/latest-servers-card";
import { SalesByPlanCard } from "@/features/admin/components/dashboard/sales-by-plan-card";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Dashboard"),
    noIndex: true,
  });
}

export default function Page() {
  const t = useExtracted();

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Dashboard")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="grid gap-4">
        <ActivityStatsRow promise={getActivityStats()} />
        <div className="grid flex-1 auto-rows-max gap-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_250px] xl:grid-cols-4">
            <div className="grid auto-rows-max items-start gap-4 lg:col-span-2">
              <CustomersOverTimeCard />
              <SalesByPlanCard />
            </div>
            <div className="grid auto-rows-max items-start gap-4 lg:col-span-2">
              <LatestServersCard />
              <LatestCustomersCard />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
