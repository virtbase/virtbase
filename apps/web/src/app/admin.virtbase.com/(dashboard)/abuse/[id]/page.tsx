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
import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExtracted } from "next-intl/server";
import { getAbuseCase } from "@/features/admin/api/abuse/get-abuse-cases";
import { verifySession } from "@/features/admin/api/verify-session";
import { AbuseCaseDetailView } from "@/features/admin/components/abuse/abuse-case-detail";
import { paths } from "@/lib/paths";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const abuseCase = await getAbuseCase(id);

  return constructMetadata({
    title: abuseCase?.reference ?? "Abuse",
    noIndex: true,
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await verifySession();

  const { id } = await params;
  const abuseCase = await getAbuseCase(id);

  if (!abuseCase) notFound();

  const t = await getExtracted();

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={paths.admin.abuse.getHref()}>
                {t("Abuse")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{abuseCase.reference}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="mt-12">
        <AbuseCaseDetailView abuseCase={abuseCase} />
      </div>
    </DashboardLayout>
  );
}
