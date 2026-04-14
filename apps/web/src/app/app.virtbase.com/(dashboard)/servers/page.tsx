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
import { LucidePlus } from "@virtbase/ui/icons";
import { constructMetadata, PUBLIC_DOMAIN } from "@virtbase/utils";
import type { Metadata } from "next";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { ServersList } from "@/features/servers/components/servers-list";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Servers"),
    noIndex: true,
  });
}

export default function Page() {
  const t = useExtracted();

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t("Servers")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      rightSide={
        <Button size="sm" variant="outline" asChild>
          <a href={PUBLIC_DOMAIN}>
            <LucidePlus aria-hidden="true" />
            {t("Rent a new server")}
          </a>
        </Button>
      }
    >
      <ServersList />
    </DashboardLayout>
  );
}
