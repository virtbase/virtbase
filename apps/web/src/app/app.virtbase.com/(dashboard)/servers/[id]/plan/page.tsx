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
import { CancellationSection } from "@/features/servers/components/plan/cancellation-section";
import { ChangePlanCard } from "@/features/servers/components/plan/change-plan-card";
import { CurrentPlanSection } from "@/features/servers/components/plan/current-plan-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Plan"),
    noIndex: true,
  });
}

/**
 * Everything a customer can do about what their server costs, in one page.
 *
 * Ordered by what they came to do rather than by how the data is stored:
 *
 * 1. **What they have** - the plan, when it renews, what pays for it, and the
 *    two things that are actionable on sight: the renewal switch and a failing
 *    payment.
 * 2. **What they could have** - the catalogue, where extending and upgrading
 *    both start. Choosing is a decision rather than a status, so it sits below
 *    the status and commits in a dialog.
 * 3. **Cancellation** - last, quieter, and permanently visible. § 312k BGB
 *    requires the control to be directly and easily reachable, so it is never
 *    behind a disclosure and the server overview links here. See
 *    {@link CancellationSection}.
 */
export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <CurrentPlanSection />
      <ChangePlanCard />
      <CancellationSection />
    </div>
  );
}
