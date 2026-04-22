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

import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { getExtracted } from "next-intl/server";
import { PlanProvider } from "@/features/servers/components/plan/plan-context";
import { PlanForm } from "@/features/servers/components/plan/plan-form";
import { PlanSummary } from "@/features/servers/components/plan/plan-summary";
import { BlockWrapper } from "@/ui/block-wrapper";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Plan"),
    noIndex: true,
  });
}

export default async function Page() {
  return (
    <main>
      <BlockWrapper variant="hero" width="full">
        <div className="pt-8" />
      </BlockWrapper>
      <BlockWrapper width="full">
        <div className="grid grid-cols-12 gap-px bg-border">
          <PlanProvider>
            <div className="col-span-12 flex flex-col gap-4 bg-background p-5 xl:col-span-8">
              <PlanForm />
            </div>
            <div className="col-span-12 bg-background xl:col-span-4">
              <PlanSummary />
            </div>
          </PlanProvider>
        </div>
      </BlockWrapper>
      <BlockWrapper variant="hero" width="full" direction="reverse">
        <div className="py-8" />
      </BlockWrapper>
    </main>
  );
}
