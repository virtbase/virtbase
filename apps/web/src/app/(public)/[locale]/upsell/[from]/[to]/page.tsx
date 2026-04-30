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
import type { LucideIcon } from "@virtbase/ui/icons/index";
import {
  LucideHardDrive,
  LucideLifeBuoy,
  LucidePiggyBank,
  LucideRabbit,
  LucideRocket,
  LucideShield,
  LucideSquareStack,
} from "@virtbase/ui/icons/index";
import {
  constructMetadata,
  constructOpengraphUrl,
  formatBits,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import { notFound } from "next/navigation";
import { getExtracted, getFormatter, getLocale } from "next-intl/server";
import { getServerPlan } from "@/features/checkout/api/get-server-plan";
import { OfferCard } from "@/features/checkout/components/offer-card";
import { AdvantageItem } from "@/features/landing/components/advantage-item";
import { BlockWrapper } from "@/ui/block-wrapper";

const PLACEHOLDER_ID = "__placeholder__";

export async function generateStaticParams() {
  const plans = await db.transaction(
    async (tx) => {
      return tx.select({ id: serverPlans.id }).from(serverPlans);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!plans.length || plans.length < 2) {
    return [
      {
        from: PLACEHOLDER_ID,
        to: PLACEHOLDER_ID,
      },
    ];
  }

  // Map each plan to all other plans, never pairing a plan with itself
  return plans.flatMap((from) =>
    plans
      .filter((to) => to.id !== from.id)
      .map((to) => ({
        from: from.id,
        to: to.id,
      })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/upsell/[from]/[to]">) {
  const { from, to } = await params;

  if (from === PLACEHOLDER_ID || to === PLACEHOLDER_ID || from === to) {
    notFound();
  }

  const locale = await getLocale();
  const t = await getExtracted();

  const title = t("Upgrade to a more powerful server");
  const description = t("A small extra charge. Significantly more power.");

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}/upsell/${from}/${to}`,
    noIndex: true,
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      theme: "dark",
    }),
  });
}

export default async function Page({
  params,
}: PageProps<"/[locale]/upsell/[from]/[to]">) {
  const { from, to } = await params;

  if (from === PLACEHOLDER_ID || to === PLACEHOLDER_ID || from === to) {
    notFound();
  }

  const fromPlan = await getServerPlan(from);
  const toPlan = await getServerPlan(to);

  if (!fromPlan || !toPlan) {
    notFound();
  }

  if (fromPlan.upsellTo !== toPlan.id) {
    // Only allow upsells that are explicitly defined in the database
    notFound();
  }

  const t = await getExtracted();

  return (
    <main>
      <BlockWrapper variant="hero">
        <div className="relative p-8">
          <div className="relative mx-auto text-center sm:max-w-lg">
            <h1 className="mt-5 text-balance text-center font-medium text-4xl text-foreground sm:text-5xl sm:leading-[1.15]">
              {t("Upgrade to a more powerful server")}
            </h1>
            <p className="mt-4 text-pretty text-lg text-muted-foreground sm:text-xl">
              {t("A small extra charge. Significantly more power.")}
            </p>
          </div>
        </div>
      </BlockWrapper>
      <BlockWrapper>
        <div className="grid overflow-hidden md:grid-cols-2 [&>*:not(:last-child)]:border-border max-md:[&>*:not(:last-child)]:border-b md:[&>*:not(:last-child)]:border-r">
          {[fromPlan, toPlan].map((plan) => (
            <OfferCard
              key={plan.id}
              plan={{
                ...plan,
                // TODO: Make dynamic
                isAvailable: true,
              }}
              // TODO: Make dynamic
              datacenter={{
                id: "dc_1",
                name: "SkyLink Data Center",
                country: "NL",
              }}
            />
          ))}
        </div>
      </BlockWrapper>
      <BlockWrapper className="py-4">
        <div className="border-y">
          <UpsellAdvantages fromPlan={fromPlan} toPlan={toPlan} />
        </div>
      </BlockWrapper>
    </main>
  );
}

type UpsellPlan = NonNullable<Awaited<ReturnType<typeof getServerPlan>>>;

async function UpsellAdvantages({
  fromPlan,
  toPlan,
}: {
  fromPlan: UpsellPlan;
  toPlan: UpsellPlan;
}) {
  const t = await getExtracted();
  const format = await getFormatter();

  const items = [
    // Items depending on plan changes
    {
      condition: (from, to) => from.cores < to.cores,
      title: (from, to) =>
        t("{cores, plural, =0 {+# vCores} =1 {+# vCore} other {+# vCores}}", {
          cores: to.cores - from.cores,
        }),
      description: t("Improved multi-tasking performance"),
      icon: LucideSquareStack,
    },
    {
      condition: (from, to) => from.memory < to.memory,
      title: (from, to) =>
        t("{percent} more RAM", {
          percent: format.number(1 - from.memory / to.memory, {
            style: "percent",
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
          }),
        }),
      description: t("Faster application responsiveness"),
      icon: LucideRabbit,
    },
    {
      condition: (from, to) => from.storage < to.storage,
      title: (from, to) =>
        t("{percent} more storage", {
          percent: format.number(1 - from.storage / to.storage, {
            style: "percent",
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
          }),
        }),
      description: t("Store more content on your server"),
      icon: LucideHardDrive,
    },
    {
      condition: (from, to) =>
        from.netrate !== null &&
        to.netrate !== null &&
        from.netrate < to.netrate,
      title: (from, to) =>
        t("{value} more bandwidth", {
          value: formatBits(
            ((to.netrate as number) - (from.netrate as number)) * 1e6 * 8,
            {
              formatter: format,
              perSecond: true,
              base: 1000,
              unit: "gigabit",
            },
          ),
        }),
      description: t("Noticeable increase in data transfer speeds"),
      icon: LucideRocket,
    },
    // Default items to fill up the grid if not enough changes
    {
      condition: () => true,
      title: () => t("No setup fee"),
      description: t("Free setup, no additional charges"),
      icon: LucidePiggyBank,
    },
    {
      condition: () => true,
      title: () => t("24/7 support"),
      description: t("Available around the clock whenever you need it"),
      icon: LucideLifeBuoy,
    },
    {
      condition: () => true,
      title: () => t("Active DDoS protection"),
      description: t("Your server is protected without additional charges"),
      icon: LucideShield,
    },
  ] satisfies {
    condition: (from: UpsellPlan, to: UpsellPlan) => boolean;
    title: (from: UpsellPlan, to: UpsellPlan) => string;
    description: string;
    icon: LucideIcon;
  }[];

  return (
    <div className="grid grid-cols-1 gap-px bg-border text-sm sm:grid-cols-2 lg:grid-cols-4">
      {items
        .filter((item) => item.condition(fromPlan, toPlan))
        .slice(0, 4)
        .map((item, index) => (
          <AdvantageItem
            key={index}
            title={item.title(fromPlan, toPlan)}
            description={item.description}
            icon={item.icon}
          />
        ))}
    </div>
  );
}
