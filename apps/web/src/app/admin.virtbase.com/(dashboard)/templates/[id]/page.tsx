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
import { notFound } from "next/navigation";
import { getExtracted } from "next-intl/server";
import { Suspense } from "react";
import { getProxmoxTemplateGroupsList } from "@/features/admin/api/proxmox-template-groups/get-proxmox-template-groups-list";
import {
  getTemplate,
  getTemplateImageStatus,
} from "@/features/admin/api/proxmox-templates/get-templates-list";
import { verifySession } from "@/features/admin/api/verify-session";
import { TemplateActionsRow } from "@/features/admin/components/proxmox-templates/template-actions-row";
import { TemplateImageIssuesCard } from "@/features/admin/components/proxmox-templates/template-image-issues-card";
import { TemplateSettings } from "@/features/admin/components/proxmox-templates/template-settings";
import { VendorDataPreview } from "@/features/admin/components/proxmox-templates/vendor-data-preview";
import { paths } from "@/lib/paths";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export async function generateMetadata({
  params,
}: PageProps<"/admin.virtbase.com/templates/[id]">): Promise<Metadata> {
  const { id } = await params;
  const template = await getTemplate(id);

  return constructMetadata({ title: template?.name ?? "", noIndex: true });
}

export default async function Page({
  params,
}: PageProps<"/admin.virtbase.com/templates/[id]">) {
  await verifySession();

  const t = await getExtracted();
  const { id } = await params;

  const template = await getTemplate(id);
  if (!template) notFound();

  const [nodes, groups] = await Promise.all([
    getTemplateImageStatus(id),
    getProxmoxTemplateGroupsList({
      page: 1,
      perPage: 100,
      sort: [],
      name: "",
      priority: null,
      createdAt: [],
      updatedAt: [],
      filters: [],
      joinOperator: "and",
    }),
  ]);

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={paths.admin.templates.getHref()}>
                {t("Templates")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{template.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      rightSide={
        <TemplateActionsRow
          template={{ id: template.id, name: template.name }}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TemplateImageIssuesCard nodes={nodes} />

        <TemplateSettings
          groups={groups.data.map((group) => ({
            id: group.id,
            name: group.name,
          }))}
          template={{
            id: template.id,
            proxmox_template_group_id: template.proxmoxTemplateGroupId,
            name: template.name,
            icon: template.icon,
            enabled: template.enabled,
            required_cores: template.requiredCores,
            recommended_cores: template.recommendedCores,
            required_memory: template.requiredMemory,
            recommended_memory: template.recommendedMemory,
            required_storage: template.requiredStorage,
            recommended_storage: template.recommendedStorage,
            image_url: template.imageUrl,
            image_checksum: template.imageChecksum,
            image_checksum_algorithm: template.imageChecksumAlgorithm,
            // Inferred from the URL when it is not set explicitly, so there is
            // nothing here for an operator to decide.
            image_compression: template.imageCompression,
            image_refresh_days: template.imageRefreshDays,
            architecture: template.architecture,
            os_family: template.osFamily,
            os_version: template.osVersion,
            package_manager: template.packageManager,
            init_system: template.initSystem,
            ostype: template.ostype,
            cpu_type: template.cpuType,
            bios_type: template.biosType,
            machine: template.machine,
          }}
        />

        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <VendorDataPreview proxmoxTemplateId={template.id} />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
