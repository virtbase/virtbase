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
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { Suspense } from "react";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  // TODO: Fetch template group name
  return constructMetadata({
    title: t("Template Groups"),
    noIndex: true,
  });
}

export default function Page({
  searchParams: _,
  params: __,
}: PageProps<"/admin.virtbase.com/template-groups/[id]">) {
  const t = useExtracted();

  return (
    <DashboardLayout
      /** TODO: Add breadcrumb */
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Template Groups")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      //rightSide={<CreateTemplateButton />}
    >
      <div>TODO: Template group details</div>
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={4}
            filterCount={2}
            cellWidths={["10rem", "10rem", "10rem", "6rem"]}
            shrinkZero
          />
        }
      >
        {/** TODO: Add templates card */}
        {/* <TemplatesCard searchParams={searchParams} params={params} /> */}
      </Suspense>
    </DashboardLayout>
  );
}
