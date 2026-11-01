/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@virtbase/ui/breadcrumb";
import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExtracted } from "next-intl/server";
import {
  getSnippet,
  getSnippetTemplates,
} from "@/features/admin/api/cloud-init-snippets/get-snippets-list.ts";
import { verifyRenderSession } from "@/features/admin/api/verify-session.ts";
import { SnippetActionsRow } from "@/features/admin/components/cloud-init-snippets/snippet-actions-row.tsx";
import { SnippetSettings } from "@/features/admin/components/cloud-init-snippets/snippet-settings.tsx";
import { paths } from "@/lib/paths.ts";
import DashboardLayout from "@/ui/layout/dashboard-layout.tsx";

export async function generateMetadata({
  params,
}: PageProps<"/admin.virtbase.com/[locale]/snippets/[id]">): Promise<Metadata> {
  const { id } = await params;
  const snippet = await getSnippet(id);

  return constructMetadata({ title: snippet?.name ?? "", noIndex: true });
}

export default async function Page({
  params,
}: PageProps<"/admin.virtbase.com/[locale]/snippets/[id]">) {
  await verifyRenderSession();

  const t = await getExtracted();
  const { id } = await params;

  const snippet = await getSnippet(id);
  if (!snippet) notFound();

  const templates = await getSnippetTemplates();
  const matchCount = templates.length;

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={paths.admin.snippets.getHref()}>
                {t("Snippets")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{snippet.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      rightSide={
        <SnippetActionsRow
          snippet={{ id: snippet.id, name: snippet.name, matchCount }}
        />
      }
    >
      <SnippetSettings snippet={snippet} templates={templates} />
    </DashboardLayout>
  );
}
