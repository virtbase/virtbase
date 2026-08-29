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

import { Skeleton } from "@virtbase/ui/skeleton";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { ActiveAbuseCases } from "./active-abuse-cases";

/**
 * The dashboard's abuse card, when there is one.
 *
 * The card lives inside the client component rather than around it, because
 * a customer with no open case should see nothing at all here - a permanent
 * "no abuse reports" panel on the dashboard is an accusation with no subject.
 */
export function ActiveAbuseCasesCard() {
  void prefetch(trpc.abuse.list.queryOptions());

  return (
    <HydrateClient>
      {/* No error fallback: this card is not what the dashboard is for, and a
          failed abuse query should not put an error box above the servers. */}
      <ErrorBoundary fallback={null}>
        <Suspense fallback={<Skeleton className="h-28 w-full" />}>
          <ActiveAbuseCases />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
}
