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

import { Card, CardContent } from "@virtbase/ui/card";
import { LucideBookOpen, LucideGlobe } from "@virtbase/ui/icons";
import { notFound } from "next/navigation";
import { getExtracted } from "next-intl/server";
import { getIntegration } from "../../api/integrations/get-integrations-list";
import { IntegrationEnableButton } from "./integration-enable-button";
import { IntegrationHealthPanel } from "./integration-health-panel";
import { IntegrationIcon } from "./integration-icon";
import { IntegrationSettingsForm } from "./integration-settings-form";

export async function IntegrationDetail({
  integrationId,
}: {
  integrationId: string;
}) {
  const item = await getIntegration(integrationId);

  if (!item) notFound();

  const t = await getExtracted();

  const { descriptor } = item;
  // Whether there is a form to render, not whether the integration may be
  // switched on. Some integrations carry no installation-level configuration
  // at all - the outgoing webhook keeps its URL and signing secret on each
  // notification target - and refusing to enable those makes them
  // unreachable.
  const configurable =
    descriptor.settingsFields.length > 0 || descriptor.secretFields.length > 0;

  return (
    <>
      <div className="flex justify-between gap-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <IntegrationIcon
            icon={descriptor.icon}
            className="size-10 sm:size-14"
          />
          <div>
            <h1 className="font-semibold text-base text-foreground leading-none">
              {descriptor.name}
            </h1>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground leading-snug">
              {descriptor.description}
            </p>
          </div>
        </div>
      </div>

      <div className="z-10 flex flex-col justify-between gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:gap-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
          <MetaItem label={t("Built by")} value={descriptor.author} />
          {descriptor.website ? (
            <MetaItem
              label={t("Website")}
              value={
                <a
                  href={descriptor.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1.5 text-[0.8125rem] transition-colors duration-100 hover:text-foreground"
                >
                  <LucideGlobe className="size-3.5" />
                  {new URL(descriptor.website).hostname}
                </a>
              }
            />
          ) : null}
          {descriptor.docsUrl ? (
            <MetaItem
              label={t("Docs")}
              value={
                <a
                  href={descriptor.docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1.5 text-[0.8125rem] transition-colors duration-100 hover:text-foreground"
                >
                  <LucideBookOpen className="size-3.5" />
                  {t("Read the docs")}
                </a>
              }
            />
          ) : null}
        </div>

        <div className="flex items-center gap-x-2">
          <IntegrationEnableButton
            integrationId={descriptor.id}
            enabled={item.enabled}
          />
        </div>
      </div>

      <IntegrationHealthPanel item={item} />

      {configurable ? (
        <IntegrationSettingsForm item={item} />
      ) : (
        <Card>
          <CardContent className="py-6 text-muted-foreground text-sm">
            {t(
              "This integration has nothing to configure here. Switching it on is all there is.",
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs uppercase">{label}</span>
      <span className="font-medium text-[0.8125rem] text-foreground/80">
        {value}
      </span>
    </div>
  );
}
