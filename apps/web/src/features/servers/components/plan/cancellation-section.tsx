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

import { Skeleton } from "@virtbase/ui/skeleton";
import { useParams } from "next/navigation";
import { useCancelSubscription } from "@/features/servers/hooks/billing/use-cancel-subscription";
import { useResumeSubscription } from "@/features/servers/hooks/billing/use-resume-subscription";
import { useServerSubscription } from "@/features/servers/hooks/billing/use-server-subscription";
import { CancellationCard } from "./cancellation-card";

/**
 * The § 312k BGB cancellation control, and the data behind it.
 *
 * ## The rules this file exists to keep
 *
 * - It is the **last section of the plan page and is never wrapped in
 *   anything that hides it**: no accordion, no `<details>`, no collapsible,
 *   no dropdown, no "danger zone" the customer has to expand. The card below
 *   is quieter than the two above it on purpose, but quiet is a matter of
 *   contrast and never of a disclosure the customer has to find and open.
 * - It is **rendered for every subscription**, whatever its status, and is
 *   not made conditional on automatic renewal being switched on. The
 *   Bundesgerichtshof extended the duty in May 2025 to every contract whose
 *   service is performed continuously, which a Virtbase server is either way.
 * - It is **one click from where a customer lands**: the server overview
 *   carries a permanent link to this page, and the plan tab is in the server
 *   navigation on every one of its sub-pages.
 *
 * A server with no subscription row renders nothing here, because there is no
 * continuing obligation to end - such a server simply stops at
 * `terminates_at`, which "Your plan" says in as many words above.
 *
 * See {@link CancellationCard} for the frame, and `CancelSubscriptionSection`
 * and `CancelSubscriptionDialog` for the other half of the rule: what the
 * control may be labelled, and what the confirmation behind it may contain.
 */
export function CancellationSection() {
  const { id: serverId } = useParams<{ id: string }>();

  const { data: subscription, isPending } = useServerSubscription(serverId);

  const { mutate: cancel, isPending: isCancelling } = useCancelSubscription();
  const { mutate: resume, isPending: isResuming } = useResumeSubscription();

  if (isPending) return <Skeleton className="h-24 w-full" />;

  if (!subscription) return null;

  return (
    <CancellationCard
      subscription={subscription}
      onCancel={() => cancel({ id: subscription.id })}
      onResume={() => resume({ id: subscription.id })}
      isCancelling={isCancelling}
      isResuming={isResuming}
    />
  );
}
