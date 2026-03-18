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

"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@virtbase/ui/breadcrumb";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useExtracted } from "next-intl";
import { Fragment } from "react";
import { paths } from "@/lib/paths";

export function AccountBreadcrumb() {
  const t = useExtracted();

  const pathname = usePathname();

  const breadcrumbItems = {
    settings: {
      title: t("General"),
      path: paths.app.account.settings.getHref(),
    },
    "settings/authentication": {
      title: t("Security"),
      path: paths.app.account.settings.authentication.getHref(),
    },
    "settings/billing": {
      title: t("Billing"),
      path: paths.app.account.settings.billing.getHref(),
    },
    "settings/api": {
      title: t("API"),
      path: paths.app.account.settings.api.getHref(),
    },
    "settings/ssh-keys": {
      title: t("SSH Keys"),
      path: paths.app.account.settings.sshKeys.getHref(),
    },
  } as const;

  const item = Object.values(breadcrumbItems).find((item) =>
    pathname.endsWith(item.path),
  );

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <NextLink
              href={paths.app.account.settings.getHref()}
              prefetch={false}
            >
              {t("Account")}
            </NextLink>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {item && (
          <Fragment>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{item.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </Fragment>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
