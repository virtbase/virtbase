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

import { Card, CardContent } from "@virtbase/ui/card";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import {
  CheckoutStateProvider,
  useCheckoutState,
} from "@/features/checkout/hooks/use-checkout-state";
import { useServerPlans } from "../../hooks/plan/use-server-plans";
import { CHANGE_PLAN_ANCHOR } from "./anchors";
import { PlanCatalog } from "./plan-catalog";
import { PlanProvider } from "./plan-context";
import { PlanOrderDialog } from "./plan-order-dialog";
import { PlanPaymentStep } from "./plan-payment-step";

/**
 * The catalogue, and nothing above it.
 *
 * It carried a heading and a paragraph explaining that a plan can be extended
 * or changed. A list of plans with a price on every row and a named button on
 * each - "Extend" on the current one, "Upgrade" on the rest - says that by
 * itself, so the words went and `CardHeader` went with them: an empty header
 * is a gap, not a frame.
 *
 * The section keeps {@link CHANGE_PLAN_ANCHOR} because the empty state on the
 * card above links straight here.
 */
export function ChangePlanCard() {
  return (
    <Card id={CHANGE_PLAN_ANCHOR} className="scroll-mt-4 overflow-hidden">
      <CardContent>
        <CheckoutStateProvider>
          <ChangePlanFlow />
        </CheckoutStateProvider>
      </CardContent>
    </Card>
  );
}

/**
 * The only part of the flow that knows a query client exists.
 *
 * Everything below it takes what it renders as props or off the context, which
 * is what lets the list and the dialog be exercised together in a test without
 * a router, a URL or a tRPC client behind them.
 */
function ChangePlanFlow() {
  const { id: serverId } = useParams<{ id: string }>();

  const { data, isPending } = useServerPlans({ server_id: serverId });
  const checkout = useCheckoutState();

  const plans = useMemo(() => data?.plans ?? [], [data]);
  const currentPlan = useMemo(
    () => plans.find((plan) => plan.current) ?? null,
    [plans],
  );

  return (
    <PlanProvider
      serverId={serverId}
      plans={plans}
      currentPlan={currentPlan}
      isPending={isPending}
      checkout={checkout}
    >
      <PlanCatalog />
      <PlanOrderDialog paymentStep={<PlanPaymentStep />} />
    </PlanProvider>
  );
}
