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

import { zodResolver } from "@hookform/resolvers/zod";
import type { ExtendOrUpgradeServerPlanInput } from "@virtbase/validators";
import { ExtendOrUpgradeServerPlanInputSchema } from "@virtbase/validators";
import { useParams } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { CheckoutStateProvider } from "@/features/checkout/hooks/use-checkout-state";
import type { GetServerPlansOutput } from "../../hooks/plan/use-server-plans";
import { useServerPlans } from "../../hooks/plan/use-server-plans";

type Plan = GetServerPlansOutput["plans"][number];

interface PlanContextType {
  plans: Plan[];
  currentPlan: Plan | null;
  selectedPlan: Plan | null;
  isPending: boolean;
  form: UseFormReturn<ExtendOrUpgradeServerPlanInput>;
  /**
   * True while the Stripe Elements payment confirmation is in flight.
   * Lets sibling UI (e.g. the "Change plan" back button) lock down so the
   * checkout session can't be torn down mid-payment.
   */
  isConfirmingPayment: boolean;
  setIsConfirmingPayment: (isConfirming: boolean) => void;
}

const PlanContext = createContext<PlanContextType | null>(null);

export const PlanProvider = ({ children }: React.PropsWithChildren) => {
  const { id: serverId } = useParams<{ id: string }>();

  const { data: { plans } = { plans: [] }, isPending } = useServerPlans({
    server_id: serverId,
  });

  const currentPlan = useMemo(
    () => plans.find((plan) => plan.current) ?? null,
    [plans],
  );

  const [queryPlanId, setQueryPlanId] = useQueryState(
    "plan_id",
    parseAsString.withOptions({
      shallow: true,
      clearOnDefault: true,
    }),
  );

  const form = useForm<ExtendOrUpgradeServerPlanInput>({
    resolver: zodResolver(ExtendOrUpgradeServerPlanInputSchema),
    defaultValues: {
      type: "extend_server",
      server_plan_id: queryPlanId ?? "",
      server_id: serverId,
      /** Legal requirements */
      terms: false,
      waiver: false,
    },
  });

  /**
   * Once plans load, seed the form with either the URL selection or the
   * current plan. This runs once per plan load and never fights user input
   * because it only fills in an empty value.
   */
  useEffect(() => {
    if (isPending) return;
    if (form.getValues("server_plan_id")) return;

    const initialId = queryPlanId ?? currentPlan?.id;
    if (!initialId) return;

    form.setValue("server_plan_id", initialId, { shouldDirty: false });
    form.setValue(
      "type",
      currentPlan && initialId === currentPlan.id
        ? "extend_server"
        : "upgrade_server",
      { shouldDirty: false },
    );
  }, [isPending, currentPlan, queryPlanId, form]);

  /**
   * Mirror the form's selection into the URL. The form is the single source
   * of truth; the URL is a projection of it (for deep links/back nav).
   */
  const selectedPlanId = useWatch({
    control: form.control,
    name: "server_plan_id",
  });

  useEffect(() => {
    if (!selectedPlanId) return;
    if (selectedPlanId === queryPlanId) return;
    void setQueryPlanId(selectedPlanId);
  }, [selectedPlanId, queryPlanId, setQueryPlanId]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  const value = useMemo<PlanContextType>(
    () => ({
      plans,
      currentPlan,
      selectedPlan,
      isPending,
      form,
      isConfirmingPayment,
      setIsConfirmingPayment,
    }),
    [plans, currentPlan, selectedPlan, isPending, form, isConfirmingPayment],
  );

  return (
    <CheckoutStateProvider>
      <PlanContext.Provider value={value}>
        <FormProvider {...form}>{children}</FormProvider>
      </PlanContext.Provider>
    </CheckoutStateProvider>
  );
};

export const usePlanContext = () => {
  const context = useContext(PlanContext);

  if (!context) {
    throw new Error("usePlanContext must be used within a PlanProvider");
  }

  return context;
};
