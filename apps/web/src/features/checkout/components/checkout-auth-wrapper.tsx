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

import { buttonVariants } from "@virtbase/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideUser } from "@virtbase/ui/icons";
import { APP_DOMAIN, PUBLIC_DOMAIN } from "@virtbase/utils";
import { headers } from "next/headers";
import { getExtracted, getLocale } from "next-intl/server";
import { auth } from "@/lib/auth/server";

export async function CheckoutAuthWrapper({
  children,
  planId,
}: {
  children: React.ReactNode;
  planId: string;
}) {
  const t = await getExtracted();
  const locale = await getLocale();

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    const returnUrl = `${PUBLIC_DOMAIN}/${locale}/checkout/${planId}`;

    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideUser aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("Authentication required")}</EmptyTitle>
          <EmptyDescription>
            {t(
              "For the continuation of the order, the creation of a customer account is required.",
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <a
              href={`${APP_DOMAIN}/login?next=${encodeURIComponent(returnUrl)}`}
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
              })}
            >
              {t("Sign in")}
            </a>
            <a
              href={`${APP_DOMAIN}/register?next=${encodeURIComponent(returnUrl)}`}
              className={buttonVariants({
                variant: "default",
                size: "sm",
              })}
            >
              {t("Sign up")}
            </a>
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  return children;
}
