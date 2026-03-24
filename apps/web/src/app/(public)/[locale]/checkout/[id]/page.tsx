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

import { db } from "@virtbase/db/client";
import { serverPlans } from "@virtbase/db/schema";
import {
  APP_NAME,
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "next-intl";
import { getExtracted, getLocale } from "next-intl/server";
import { Suspense } from "react";
import { getServerPlan } from "@/features/checkout/api/get-server-plan";
import { getTemplateGroups } from "@/features/checkout/api/get-template-groups";
import { CheckoutAuthWrapper } from "@/features/checkout/components/checkout-auth-wrapper";
import { CheckoutForm } from "@/features/checkout/components/checkout-form";
import { CheckoutFormSkeleton } from "@/features/checkout/components/checkout-form-skeleton";
import { OrderSummary } from "@/features/checkout/components/order-summary";
import { BlockWrapper } from "@/ui/block-wrapper";

type PageProps = {
  params: Promise<{ locale: Locale; id: string }>;
};

export async function generateStaticParams() {
  const plans = await db.transaction(
    async (tx) => tx.select({ id: serverPlans.id }).from(serverPlans),
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!plans.length) {
    return [{ id: "__placeholder__" }];
  }

  return plans.map((plan) => ({
    id: plan.id,
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const id = (await params).id;

  if (id === "__placeholder__") {
    return {};
  }

  const plan = await getServerPlan(id);
  if (!plan) {
    notFound();
  }

  const locale = await getLocale();
  const t = await getExtracted();

  const title = t("Configure {name}", { name: plan.name });
  const description = t("Configure the server plan {name} on {appName}", {
    name: plan.name,
    appName: APP_NAME,
  });

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}/checkout/${id}`,
    noIndex: true,
    image: constructOpengraphUrl({
      title: t("Configure {name}", { name: plan.name }),
      subtitle: t("Configure the server plan {name} on {appName}", {
        name: plan.name,
        appName: APP_NAME,
      }),
      theme: "dark",
    }),
  });
}

export default async function Page({ params }: PageProps) {
  const id = (await params).id;
  if (id === "__placeholder__") {
    notFound();
  }

  const t = await getExtracted();
  const plan = await getServerPlan(id);

  if (!plan) {
    notFound();
  }

  return (
    <main>
      <BlockWrapper variant="hero">
        <div className="p-8" />
      </BlockWrapper>
      <BlockWrapper>
        <div className="grid grid-cols-12 gap-px bg-border">
          <div className="col-span-12 bg-background md:col-span-4">
            <div className="flex flex-col gap-4 p-5 md:sticky md:top-20">
              <OrderSummary
                plan={plan}
                datacenter={{
                  id: "dc_1",
                  name: "SkyLink Data Center",
                  country: "NL",
                }}
              />
            </div>
          </div>
          <div className="col-span-12 flex flex-col gap-4 bg-background p-5 md:col-span-8">
            <Suspense fallback={<CheckoutFormSkeleton />}>
              <CheckoutAuthWrapper planId={id}>
                <CheckoutForm
                  promise={getTemplateGroups(plan.proxmoxNodeGroupId)}
                />
              </CheckoutAuthWrapper>
            </Suspense>
          </div>
        </div>
      </BlockWrapper>
      <BlockWrapper className="py-10">
        <p className="px-4 text-center text-muted-foreground text-sm">
          {t("All prices include statutory VAT, if applicable.")}
        </p>
      </BlockWrapper>
    </main>
  );
}
