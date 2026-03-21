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

import { Badge } from "@virtbase/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideChevronRight,
  LucideClock,
  LucideUserX,
} from "@virtbase/ui/icons";
import NextLink from "next/link";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { use } from "react";
import type { getLatestCustomers } from "@/features/admin/api/dashboard/get-latest-customers";
import { paths } from "@/lib/paths";
import { UserAvatar } from "@/ui/user-avatar";

export function LatestCustomersList({
  promise,
}: {
  promise: ReturnType<typeof getLatestCustomers>;
}) {
  const customers = use(promise);

  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 1000 });

  if (!customers.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideUserX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No new customers")}</EmptyTitle>
          <EmptyDescription>
            {t("No new customers have been registered yet.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="divide-y">
      {customers.map((customer) => {
        const href = paths.admin.users.overview.getHref(customer.id);
        return (
          <div
            key={customer.id}
            className="flex items-center justify-between gap-2 py-4 first:pt-0 last:pb-0"
          >
            <div className="flex items-center gap-2">
              <UserAvatar user={customer} />
              <div className="flex flex-col">
                <div className="flex items-center space-x-1.5">
                  <NextLink
                    href={href}
                    className="truncate font-medium text-sm outline-none transition-all duration-300 hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    prefetch={false}
                  >
                    {customer.name}
                  </NextLink>
                </div>
                <span className="font-light text-muted-foreground text-xs">
                  {customer.email}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 grow">
                <Badge variant="secondary">
                  <LucideClock aria-hidden="true" />
                  {format.relativeTime(customer.createdAt, now)}
                </Badge>
              </div>
              <NextLink
                href={href}
                className="shrink-0 outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                prefetch={false}
              >
                <LucideChevronRight
                  aria-hidden="true"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                />
              </NextLink>
            </div>
          </div>
        );
      })}
    </div>
  );
}
