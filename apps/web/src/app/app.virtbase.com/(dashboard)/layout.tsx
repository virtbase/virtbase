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

import { Separator } from "@virtbase/ui/separator";
import { SidebarInset, SidebarProvider } from "@virtbase/ui/sidebar";
import { constructMetadata, PUBLIC_DOMAIN } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import { AppSidebar } from "@/ui/app-sidebar";
import { SocialsRow } from "@/ui/socials-row";

export const metadata = constructMetadata({
  noIndex: true,
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {children}
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppFooter() {
  const t = useExtracted();

  return (
    <div className="@container mt-4 px-4 pb-6 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 md:flex-row">
        <SocialsRow className="[&_svg]:text-muted-foreground [&_svg]:hover:text-foreground" />
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <a
            href={`${PUBLIC_DOMAIN}/legal/notice`}
            target="_blank"
            rel="noopener"
            className="transition-colors hover:text-foreground"
          >
            {t("Legal notice")}
          </a>
          <Separator
            orientation="vertical"
            className="data-[orientation=vertical]:h-4"
          />
          <a
            href={`${PUBLIC_DOMAIN}/legal/terms`}
            target="_blank"
            rel="noopener"
            className="transition-colors hover:text-foreground"
          >
            {t("Terms of use")}
          </a>
          <Separator
            orientation="vertical"
            className="data-[orientation=vertical]:h-4"
          />
          <a
            href={`${PUBLIC_DOMAIN}/legal/privacy`}
            target="_blank"
            rel="noopener"
            className="transition-colors hover:text-foreground"
          >
            {t("Privacy policy")}
          </a>
        </div>
      </div>
    </div>
  );
}
