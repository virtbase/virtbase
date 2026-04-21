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
import { useTRPC } from "@/lib/trpc/react";

export type GetServerPlansInput = RouterInputs["servers"]["plan"]["get"];

export type GetServerPlansOutput = RouterOutputs["servers"]["plan"]["get"];

interface GetServerPlans extends GetServerPlansInput {
  queryConfig?: never;
}

export const useServerPlans = ({ queryConfig, ...input }: GetServerPlans) => {
  const trpc = useTRPC();

  return useQuery(trpc.servers.plan.get.queryOptions(input, queryConfig));
};
