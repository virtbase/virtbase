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
import { Skeleton } from "@virtbase/ui/skeleton";
import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { getExtracted } from "next-intl/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { AbuseCasesList } from "@/features/abuse/components/abuse-cases-list";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { GenericError } from "@/ui/generic-error";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Abuse reports"),
    noIndex: true,
  });
}

export default async function Page() {
  const t = await getExtracted();

  void prefetch(trpc.abuse.list.queryOptions());

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Abuse reports")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <HydrateClient>
        <ErrorBoundary fallback={<GenericError className="border" />}>
          <Suspense
            fallback={
              <div className="grid gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            }
          >
            <AbuseCasesList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </DashboardLayout>
  );
}
