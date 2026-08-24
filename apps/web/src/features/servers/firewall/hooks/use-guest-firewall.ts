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

import { useQuery } from "@tanstack/react-query";
import type { RouterInputs, RouterOutputs } from "@virtbase/api";
import { UNBATCHED, useTRPC } from "@/lib/trpc/react";

export type GetGuestFirewallInput =
  RouterInputs["servers"]["firewall"]["guest"]["get"];

export type GetGuestFirewallOutput =
  RouterOutputs["servers"]["firewall"]["guest"]["get"];

interface GetGuestFirewall extends GetGuestFirewallInput {
  queryConfig?: never;
}

/**
 * The firewall running inside the server, if there is one.
 *
 * Each read runs commands inside the customer's machine, so the result is
 * cached server-side and this deliberately does not poll.
 */
export const useGuestFirewall = ({
  queryConfig,
  ...input
}: GetGuestFirewall) => {
  const trpc = useTRPC();

  return useQuery(
    trpc.servers.firewall.guest.get.queryOptions(input, UNBATCHED),
  );
};
