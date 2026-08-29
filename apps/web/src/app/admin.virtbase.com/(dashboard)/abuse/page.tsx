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
import { Button } from "@virtbase/ui/button";
import { DataTableSkeleton } from "@virtbase/ui/data-table";
import { LucideSlidersHorizontal } from "@virtbase/ui/icons";
import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import NextLink from "next/link";
import { getExtracted } from "next-intl/server";
import { Suspense } from "react";
import { verifySession } from "@/features/admin/api/verify-session";
import { AbuseCasesTableCard } from "@/features/admin/components/abuse/abuse-cases-table-card";
import { CreateAbuseCaseButton } from "@/features/admin/components/abuse/create-abuse-case-button";
import { paths } from "@/lib/paths";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Abuse"),
    noIndex: true,
  });
}

export default async function Page({
  searchParams,
}: PageProps<"/admin.virtbase.com/abuse">) {
  await verifySession();

  const t = await getExtracted();

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Abuse")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      rightSide={
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <NextLink href={paths.admin.abuseRules.getHref()}>
              <LucideSlidersHorizontal aria-hidden="true" />
              {t("Rules")}
            </NextLink>
          </Button>
          <CreateAbuseCaseButton />
        </div>
      }
    >
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={7}
            filterCount={4}
            cellWidths={[
              "6rem",
              "18rem",
              "8rem",
              "6rem",
              "8rem",
              "12rem",
              "8rem",
            ]}
            shrinkZero
          />
        }
      >
        <AbuseCasesTableCard searchParams={searchParams} />
      </Suspense>
    </DashboardLayout>
  );
}
