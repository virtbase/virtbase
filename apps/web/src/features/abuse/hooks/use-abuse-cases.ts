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

import { useSuspenseQuery } from "@tanstack/react-query";
import type { RouterOutputs } from "@virtbase/api";
import { useTRPC } from "@/lib/trpc/react";

export type AbuseCaseSummary = RouterOutputs["abuse"]["list"]["cases"][number];

export type CustomerAbuseCase = RouterOutputs["abuse"]["get"]["case"];

/**
 * Cases the customer can still act on.
 *
 * A settled case is readable but finished, so it does not belong in a count
 * that is meant to say "this needs you".
 */
export const ACTIVE_STATUSES = new Set([
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
]);

export const isActive = (abuseCase: AbuseCaseSummary) =>
  ACTIVE_STATUSES.has(abuseCase.status);

/** The one status where the ball is with the customer. */
export const needsAnswer = (abuseCase: AbuseCaseSummary) =>
  "awaiting_customer" === abuseCase.status;

export const useAbuseCases = () => {
  const trpc = useTRPC();

  return useSuspenseQuery(trpc.abuse.list.queryOptions());
};

export const useAbuseCase = (id: string) => {
  const trpc = useTRPC();

  return useSuspenseQuery(trpc.abuse.get.queryOptions({ id }));
};
