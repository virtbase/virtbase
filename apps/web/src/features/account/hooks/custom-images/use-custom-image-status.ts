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

import { useQuery } from "@tanstack/react-query";
import type { RouterInputs, RouterOutputs } from "@virtbase/api";
import { useTRPC } from "@/lib/trpc/react.tsx";

export type GetCustomImageStatusInput = RouterInputs["iso"]["status"]["get"];

export type GetCustomImageStatusOutput = RouterOutputs["iso"]["status"]["get"];

interface GetCustomImageStatus extends GetCustomImageStatusInput {
  queryConfig?: {
    enabled?: boolean;
    refetchInterval?: number;
  };
}

export const useCustomImageStatus = ({
  queryConfig,
  ...input
}: GetCustomImageStatus) => {
  const trpc = useTRPC();

  return useQuery(trpc.iso.status.get.queryOptions(input, queryConfig));
};
