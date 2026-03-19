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

import { useFirewallOptions } from "../hooks/use-firewall-options";
import { useUpdateFirewallOptions } from "../hooks/use-update-firewall-options";
import { FirewallActionSelect } from "./firewall-action-select";

export function FirewallActionState({
  serverId,
  policy,
}: {
  serverId: string;
  policy: "policy_in" | "policy_out";
}) {
  const {
    data: { options },
  } = useFirewallOptions({ server_id: serverId });

  const { mutate: updateOptions } = useUpdateFirewallOptions();

  return (
    <FirewallActionSelect
      onValueChange={(value: "ACCEPT" | "DROP" | "REJECT") =>
        updateOptions({
          server_id: serverId,
          [policy]: value,
        })
      }
      value={options[policy]}
    />
  );
}
