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
import { getLinkableDatacenters } from "@/features/admin/api/datacenters/get-linkable-datacenters";
import { getLinkableProxmoxNodeGroups } from "@/features/admin/api/proxmox-node-groups/get-linkable-proxmox-node-groups";
import { CreateNodeButton } from "@/features/admin/components/proxmox-nodes/create-datacenter-button";
import { NodesTableCard } from "@/features/admin/components/proxmox-nodes/nodes-table-card";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  // TODO: Fetch node group name
  return constructMetadata({
    title: t("Node Groups"),
    noIndex: true,
  });
}

export default function Page({
  searchParams,
}: PageProps<"/admin.virtbase.com/node-groups/[id]">) {
  const t = useExtracted();

  return (
    <DashboardLayout
      /** TODO: Add breadcrumb */
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Node Groups")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      rightSide={
        <CreateNodeButton
          promises={[getLinkableDatacenters(), getLinkableProxmoxNodeGroups()]}
        />
      }
    >
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
        <NodesTableCard searchParams={searchParams} />
      </Suspense>
    </DashboardLayout>
  );
}
