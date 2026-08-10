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
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@virtbase/ui/breadcrumb";
import { Skeleton } from "@virtbase/ui/skeleton";
import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { getExtracted } from "next-intl/server";
import { Suspense } from "react";
import { getIntegration } from "@/features/admin/api/integrations/get-integrations-list";
import { verifySession } from "@/features/admin/api/verify-session";
import { IntegrationDetail } from "@/features/admin/components/integrations/integration-detail";
import { paths } from "@/lib/paths";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/admin.virtbase.com/integrations/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = await getIntegration(id);

  return constructMetadata({
    title: item?.descriptor.name ?? "Integration",
    noIndex: true,
  });
}

export default async function Page({
  params,
}: PageProps<"/admin.virtbase.com/integrations/[id]">) {
  await verifySession();

  const { id } = await params;
  const t = await getExtracted();
  const item = await getIntegration(id);

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={paths.admin.integrations.getHref()}>
                {t("Integrations")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{item?.descriptor.name ?? id}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="mx-auto mt-12 flex w-full max-w-3xl flex-col gap-6">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <IntegrationDetail integrationId={id} />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
