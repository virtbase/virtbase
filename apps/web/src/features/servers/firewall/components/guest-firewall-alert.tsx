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

import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { ClientOnly } from "@virtbase/ui/client-only";
import { LucideTriangleAlert } from "@virtbase/ui/icons/index";
import { useExtracted } from "next-intl";
import { useGuestFirewall } from "../hooks/use-guest-firewall";

/**
 * Warns that a second firewall is running inside the server.
 *
 * Only shown when something is actually filtering. `no_firewall` and
 * `unavailable` both stay silent here: the first has nothing to warn about, and
 * the second is already explained by the shared guest agent notice - repeating
 * it would be two warnings for one problem.
 */
export function GuestFirewallAlert({ serverId }: { serverId: string }) {
  const t = useExtracted();

  const { data, isPending, isError } = useGuestFirewall({
    server_id: serverId,
  });

  if (isPending || isError || data?.guest.status !== "ok") {
    return null;
  }

  const { primary, unreadable_manager: unreadable } = data.guest;

  return (
    <ClientOnly>
      <Alert variant="warning">
        <LucideTriangleAlert aria-hidden="true" />
        <AlertTitle>
          {primary
            ? t("{label} is also running inside your server", {
                label: primary,
              })
            : t("A firewall is also running inside your server")}
        </AlertTitle>
        <AlertDescription>
          {unreadable
            ? t(
                "Traffic must pass both firewalls. Virtbase cannot read {label} rules yet, but they still apply.",
                { label: unreadable },
              )
            : t(
                "Traffic must pass both firewalls. Its rules are listed below.",
              )}
        </AlertDescription>
      </Alert>
    </ClientOnly>
  );
}
