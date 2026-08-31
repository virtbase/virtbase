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

import { Card, CardContent, CardFooter } from "@virtbase/ui/card";
import { Skeleton } from "@virtbase/ui/skeleton";
import type { RetrySubscriptionRenewalOutcome } from "@virtbase/validators";
import { useParams } from "next/navigation";
import { useExtracted, useNow } from "next-intl";
import { toast } from "sonner";
import { resolvePaymentMethodState } from "@/features/account/utils/payment-method";
import { useAcceptMandate } from "@/features/servers/hooks/billing/use-accept-mandate";
import { usePaymentMethods } from "@/features/servers/hooks/billing/use-payment-methods";
import { useRetryRenewal } from "@/features/servers/hooks/billing/use-retry-renewal";
import { useServerSubscription } from "@/features/servers/hooks/billing/use-server-subscription";
import { useSetAutoRenew } from "@/features/servers/hooks/billing/use-set-auto-renew";
import { useServerPlans } from "@/features/servers/hooks/plan/use-server-plans";
import { useServer } from "@/features/servers/hooks/use-server";
import { getMutationErrorDetail } from "@/lib/trpc/query-client";
import { CurrentPlanCard } from "./current-plan-card";

/**
 * The data behind the plan card, and nothing else.
 *
 * ## Why the split
 *
 * Everything this renders is a pure component taking props, and this file is
 * the only one below the page that knows a query client exists. That is not
 * decoration: the renewal opt-in and the cancellation confirmation have
 * assertions written against what they must - and must not - contain, and
 * those are only worth having if the thing under test can be rendered without
 * a tRPC client, a router and a live session behind it.
 *
 * ## Why it is on this page
 *
 * The plan page is the one place a customer can do everything about what their
 * server costs: see it, change it, extend it, decide whether it renews, and
 * end it. The § 312k BGB cancellation control lives on the same page (see
 * {@link CancellationSection}) and the server overview carries a permanent
 * link to it, so the statutory button is one click from where a customer lands
 * and behind no disclosure at either end.
 */
export function CurrentPlanSection() {
  const t = useExtracted();
  // The same clock the billing page's list reads a card's expiry against, so
  // "expired" cannot mean one thing here and another there.
  const now = useNow();

  const { id: serverId } = useParams<{ id: string }>();

  const { data: subscription, isPending: isSubscriptionPending } =
    useServerSubscription(serverId);
  const { data: methods, isPending: isMethodsPending } = usePaymentMethods();
  const { data: plans } = useServerPlans({ server_id: serverId });
  // Already in the cache: the server header in the layout reads the same
  // query. It is here for `terminates_at`, which is the only term a server
  // with no subscription has.
  const { data: serverData } = useServer({ server_id: serverId });

  /**
   * What a manual retry actually did, in a sentence.
   *
   * Written out at a `t(...)` call site in the component's own scope rather
   * than in a lookup table taking `t` as a parameter: the message extractor
   * only sees literals where the translator was resolved, and a table would
   * drop all five strings out of `en.po` without a word.
   */
  const retryMessage = (outcome: RetrySubscriptionRenewalOutcome) => {
    switch (outcome) {
      case "collecting":
        return t("Payment submitted. It can take a moment to go through.");
      case "awaiting_action":
        return t(
          "Your bank wants you to confirm this payment. Check your banking app.",
        );
      case "retry_scheduled":
        return t(
          "The payment was declined again. We will try again automatically.",
        );
      case "exhausted":
        return t(
          "The payment was declined and there are no attempts left. Add a working payment method and extend the server.",
        );
      default:
        return t("Nothing to retry right now.");
    }
  };

  const {
    mutate: setAutoRenew,
    isPending: isSettingAutoRenew,
    error: autoRenewError,
  } = useSetAutoRenew();

  const {
    mutate: acceptMandate,
    isPending: isAcceptingMandate,
    error: mandateError,
  } = useAcceptMandate({
    mutationConfig: {
      onSuccess: ({ subscription: accepted }) => {
        // Consent recorded, and only now the enrolment. Two calls because they
        // are two decisions - see `subscriptions.acceptMandate`.
        setAutoRenew({ id: accepted.id, enabled: true });
      },
    },
  });

  const { mutate: retryNow, isPending: isRetrying } = useRetryRenewal({
    mutationConfig: {
      onSuccess: ({ outcome }) => {
        toast.success(retryMessage(outcome));
      },
    },
  });

  if (isSubscriptionPending) return <CurrentPlanSkeleton />;

  const currentPlan = plans?.plans.find((plan) => plan.current) ?? null;
  const renewalAmount = currentPlan?.renewal_price ?? null;

  const paymentMethodState = resolvePaymentMethodState({
    isPending: isMethodsPending,
    saved: methods?.payment_methods,
    chargeable: subscription?.payment_method ?? null,
    now,
  });

  // The server's own account of the refusal when it is fit to show someone -
  // "Automatic renewal needs a usable payment method." reads as an instruction;
  // a bare `PRECONDITION_FAILED` does not, and is dropped in favour of the
  // fallback.
  // `useMutation` types its error as `TRPCClientErrorLike`, the structural
  // subset; what actually arrives is a `TRPCClientError`, which is an `Error`.
  const failure = (autoRenewError ?? mandateError) as Error | null;
  const renewalError = failure
    ? (getMutationErrorDetail(failure) ??
      t("Could not change automatic renewal."))
    : null;

  return (
    <CurrentPlanCard
      subscription={subscription ?? null}
      terminatesAt={serverData?.server.terminates_at ?? null}
      plan={currentPlan}
      renewalAmount={renewalAmount}
      savedPaymentMethods={methods?.payment_methods}
      isPaymentMethodsPending={isMethodsPending}
      paymentMethodState={paymentMethodState}
      onAcceptMandate={(version) => {
        if (subscription) acceptMandate({ id: subscription.id, version });
      }}
      onSetAutoRenew={(enabled) => {
        if (subscription) setAutoRenew({ id: subscription.id, enabled });
      }}
      isUpdatingRenewal={isSettingAutoRenew || isAcceptingMandate}
      renewalError={renewalError}
      onRetry={() => {
        if (subscription) retryNow({ id: subscription.id });
      }}
      isRetrying={isRetrying}
    />
  );
}

/**
 * The card's own shape while the subscription loads.
 *
 * Shaped like what arrives rather than one grey block: three rows and a
 * footer. Whether this server renews by itself is not knowable yet, and a
 * placeholder that reflows into something a third the height is what makes a
 * page feel broken.
 */
function CurrentPlanSkeleton() {
  return (
    <Card className="overflow-hidden pb-0">
      <CardContent>
        <Skeleton className="-m-px h-64 w-full" />
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <Skeleton className="h-10 w-full" />
      </CardFooter>
    </Card>
  );
}
