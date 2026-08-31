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
import { DataTableSkeleton } from "@virtbase/ui/data-table";
import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { getExtracted } from "next-intl/server";
import type { SearchParams } from "nuqs";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { verifySession } from "@/features/admin/api/verify-session";
import { SubscriptionsTableCard } from "@/features/admin/components/subscriptions/subscriptions-table-card";
import { GenericError } from "@/ui/generic-error";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Subscriptions"),
    noIndex: true,
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // [!] Authorization: the same gate every admin page and every
  // `features/admin/api` reader goes through. A signed-in non-admin gets a
  // 404, a signed-out visitor a 401.
  await verifySession();

  const t = await getExtracted();

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Subscriptions")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <ErrorBoundary fallback={<GenericError className="border" />}>
        <Suspense
          fallback={
            <DataTableSkeleton
              columnCount={6}
              filterCount={4}
              cellWidths={["16rem", "14rem", "8rem", "10rem", "6rem", "8rem"]}
              shrinkZero
            />
          }
        >
          <SubscriptionsTableCard searchParams={searchParams} />
        </Suspense>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
