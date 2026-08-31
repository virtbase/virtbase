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
import { ErrorBoundary } from "react-error-boundary";
import { getSubscription } from "@/features/admin/api/subscriptions/get-subscription";
import { verifySession } from "@/features/admin/api/verify-session";
import { SubscriptionDetailView } from "@/features/admin/components/subscriptions/subscription-detail";
import { paths } from "@/lib/paths";
import { GenericError } from "@/ui/generic-error";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const subscription = await getSubscription(id);

  return constructMetadata({
    title: subscription?.subjectName ?? subscription?.id ?? "Subscription",
    noIndex: true,
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // [!] Authorization: `getSubscription` calls this too, so the data is gated
  // whichever way it is reached. Repeated here so the page itself never
  // renders chrome for someone who may not see it.
  await verifySession();

  const { id } = await params;
  const subscription = await getSubscription(id);

  // An id typed wrong is not an error worth a stack trace, and a subscription
  // that has been erased is indistinguishable from one that never existed.
  if (!subscription) notFound();

  const t = await getExtracted();

  return (
    <DashboardLayout
      leftSide={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={paths.admin.subscriptions.getHref()}>
                {t("Subscriptions")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {subscription.subjectName ?? subscription.id}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="mt-12">
        <ErrorBoundary fallback={<GenericError className="border" />}>
          <SubscriptionDetailView subscription={subscription} />
        </ErrorBoundary>
      </div>
    </DashboardLayout>
  );
}
