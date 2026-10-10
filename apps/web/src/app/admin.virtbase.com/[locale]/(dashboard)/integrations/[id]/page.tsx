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
import { verifyRenderSession } from "@/features/admin/api/verify-session";
import { IntegrationDetail } from "@/features/admin/components/integrations/integration-detail";
import { paths } from "@/lib/paths";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export async function generateMetadata({
  params,
}: PageProps<"/admin.virtbase.com/[locale]/integrations/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = await getIntegration(id);

  return constructMetadata({
    title: item?.descriptor.name ?? "Integration",
    noIndex: true,
  });
}

type Params = Pick<
  PageProps<"/admin.virtbase.com/[locale]/integrations/[id]">,
  "params"
>;

async function IntegrationName({ params }: Params) {
  const { id } = await params;
  const item = await getIntegration(id);

  return item?.descriptor.name ?? id;
}

async function ResolvedIntegrationDetail({ params }: Params) {
  const { id } = await params;

  return <IntegrationDetail integrationId={id} />;
}

export default async function Page({
  params,
}: PageProps<"/admin.virtbase.com/[locale]/integrations/[id]">) {
  await verifyRenderSession();

  const t = await getExtracted();

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
              <BreadcrumbPage>
                <Suspense fallback={<Skeleton className="h-5 w-24" />}>
                  <IntegrationName params={params} />
                </Suspense>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="mx-auto mt-12 flex w-full max-w-3xl flex-col gap-6">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <ResolvedIntegrationDetail params={params} />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
