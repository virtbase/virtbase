/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { constructMetadata } from "@virtbase/utils";
import type { Metadata } from "next";
import { getExtracted } from "next-intl/server";
import { Suspense } from "react";
import { GuestAgentNotice } from "@/features/servers/components/guest-agent-notice";
import { FirewallFindingsCard } from "@/features/servers/firewall/components/firewall-findings-card";
import { FirewallOptionsRow } from "@/features/servers/firewall/components/firewall-options-row";
import { FirewallRulesCard } from "@/features/servers/firewall/components/firewall-rules-card";
import { GuestFirewallAlert } from "@/features/servers/firewall/components/guest-firewall-alert";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();

  return constructMetadata({
    title: t("Firewall"),
    noIndex: true,
  });
}

type Params = Pick<
  PageProps<"/app.virtbase.com/[locale]/servers/[id]/firewall">,
  "params"
>;

async function ServerFirewallNotices({ params }: Params) {
  const { id } = await params;

  return (
    <>
      <GuestAgentNotice serverId={id} />
      <GuestFirewallAlert serverId={id} />
      <FirewallFindingsCard serverId={id} />
    </>
  );
}

export default function Page({ params }: Params) {
  return (
    <div className="grid auto-rows-min grid-cols-1 gap-4">
      <FirewallOptionsRow promise={params.then(({ id }) => id)} />
      <Suspense>
        <ServerFirewallNotices params={params} />
      </Suspense>
      <FirewallRulesCard />
    </div>
  );
}
