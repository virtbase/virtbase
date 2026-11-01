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
  BreadcrumbList,
  BreadcrumbPage,
} from "@virtbase/ui/breadcrumb";
import { DataTableSkeleton } from "@virtbase/ui/data-table";
import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { getExtracted } from "next-intl/server";
import { Suspense } from "react";
import { verifyRenderSession } from "@/features/admin/api/verify-session.ts";
import { CreateSnippetButton } from "@/features/admin/components/cloud-init-snippets/create-snippet-button.tsx";
import { SnippetsTableCard } from "@/features/admin/components/cloud-init-snippets/snippets-table-card.tsx";
import DashboardLayout from "@/ui/layout/dashboard-layout.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({ title: t("Snippets"), noIndex: true });
}

export default async function Page({
  searchParams,
}: PageProps<"/admin.virtbase.com/[locale]/snippets">) {
  await verifyRenderSession();

  const t = await getExtracted();

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Snippets")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      rightSide={<CreateSnippetButton />}
    >
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={7}
            filterCount={2}
            cellWidths={[
              "4rem",
              "10rem",
              "8rem",
              "6rem",
              "10rem",
              "6rem",
              "10rem",
            ]}
            shrinkZero
          />
        }
      >
        <SnippetsTableCard searchParams={searchParams} />
      </Suspense>
    </DashboardLayout>
  );
}
