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
import { Suspense } from "react";
import { getProxmoxTemplateGroupsList } from "@/features/admin/api/proxmox-template-groups/get-proxmox-template-groups-list";
import { verifySession } from "@/features/admin/api/verify-session";
import { CreateTemplateButton } from "@/features/admin/components/proxmox-templates/create-template-button";
import { TemplatesTableCard } from "@/features/admin/components/proxmox-templates/templates-table-card";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({ title: t("Templates"), noIndex: true });
}

export default async function Page({
  searchParams,
}: PageProps<"/admin.virtbase.com/templates">) {
  await verifySession();

  const t = await getExtracted();

  // A template must belong to a group, so the create dialog needs them up
  // front - and the button stays disabled while there are none.
  const groups = await getProxmoxTemplateGroupsList({
    page: 1,
    perPage: 100,
    sort: [],
    name: "",
    priority: null,
    createdAt: [],
    updatedAt: [],
    filters: [],
    joinOperator: "and",
  });

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Templates")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      rightSide={
        <CreateTemplateButton
          groups={groups.data.map((group) => ({
            id: group.id,
            name: group.name,
          }))}
        />
      }
    >
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={6}
            filterCount={2}
            cellWidths={["10rem", "8rem", "10rem", "6rem", "10rem", "4rem"]}
            shrinkZero
          />
        }
      >
        <TemplatesTableCard searchParams={searchParams} />
      </Suspense>
    </DashboardLayout>
  );
}
