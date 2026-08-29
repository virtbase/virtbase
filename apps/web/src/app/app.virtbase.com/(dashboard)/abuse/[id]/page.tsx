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
import { ErrorBoundary } from "react-error-boundary";
import { AbuseCase } from "@/features/abuse/components/abuse-case";
import { paths } from "@/lib/paths";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { GenericError } from "@/ui/generic-error";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Abuse report"),
    noIndex: true,
  });
}

export default async function Page({
  params,
}: PageProps<"/app.virtbase.com/abuse/[id]">) {
  const { id } = await params;
  const t = await getExtracted();

  void prefetch(trpc.abuse.get.queryOptions({ id }));

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={paths.app.abuse.getHref()}>
                {t("Abuse reports")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Report")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <HydrateClient>
        <ErrorBoundary fallback={<GenericError className="border" />}>
          <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
            <AbuseCase id={id} />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </DashboardLayout>
  );
}
