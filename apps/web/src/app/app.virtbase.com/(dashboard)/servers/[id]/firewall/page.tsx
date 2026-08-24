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

export default async function Page({
  params,
}: PageProps<"/app.virtbase.com/servers/[id]/firewall">) {
  const { id } = await params;

  return (
    <div className="grid auto-rows-min grid-cols-1 gap-4">
      <FirewallOptionsRow promise={Promise.resolve(id)} />
      <GuestAgentNotice serverId={id} />
      <GuestFirewallAlert serverId={id} />
      <FirewallFindingsCard serverId={id} />
      <FirewallRulesCard />
    </div>
  );
}
