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

import type { IntegrationCategory } from "@virtbase/integration-sdk";
import Link from "next/link";
import { getExtracted } from "next-intl/server";
import { paths } from "@/lib/paths";
import type { IntegrationListItem } from "../../api/integrations/get-integrations-list";
import { getIntegrationsList } from "../../api/integrations/get-integrations-list";
import { IntegrationIcon } from "./integration-icon";

/** Section order on the hub. Categories not listed here fall to the end. */
const CATEGORY_ORDER: IntegrationCategory[] = [
  "payments",
  "billing",
  "infrastructure",
  "communication",
  "analytics",
  "abuse",
  "storage",
  "platform",
];

const getCategoryLabels = async () => {
  const t = await getExtracted();
  return {
    payments: t("Payments"),
    billing: t("Billing"),
    infrastructure: t("Infrastructure"),
    communication: t("Communication"),
    analytics: t("Analytics"),
    abuse: t("Abuse"),
    storage: t("Storage"),
    platform: t("Platform"),
  };
};

export async function IntegrationsHub() {
  const categoryLabels = await getCategoryLabels();
  const items = await getIntegrationsList();

  // Internal registrations are capabilities the platform hands to integrations,
  // not integrations anyone installs — they have nothing to configure.
  const visible = items.filter((item) => !item.descriptor.internal);

  const grouped = new Map<IntegrationCategory, IntegrationListItem[]>();
  for (const item of visible) {
    const category = item.descriptor.category;
    grouped.set(category, [...(grouped.get(category) ?? []), item]);
  }

  const sections = [...grouped.entries()].sort(
    ([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
  );

  return (
    <div className="flex flex-col gap-12">
      {sections.map(([category, entries]) => (
        <section key={category} className="flex flex-col gap-4">
          <h2 className="font-medium text-foreground leading-4">
            {categoryLabels[category] ?? category}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((item) => (
              <IntegrationTile key={item.descriptor.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function IntegrationTile({ item }: { item: IntegrationListItem }) {
  const { descriptor } = item;

  return (
    <Link
      href={paths.admin.integration.getHref(descriptor.id)}
      className="group relative rounded-lg border border-border bg-background p-4 transition-[filter] hover:shadow-xs"
    >
      <IntegrationIcon icon={descriptor.icon} />
      <h3 className="mt-4 flex items-center gap-1.5 font-semibold text-foreground text-sm">
        {descriptor.name}
      </h3>
      <p className="mt-2 line-clamp-3 text-muted-foreground text-sm">
        {descriptor.description}
      </p>
    </Link>
  );
}
