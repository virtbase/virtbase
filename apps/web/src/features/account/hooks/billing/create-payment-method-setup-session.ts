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

import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<
  TRPC["paymentMethods"]["createSetupSession"]["mutationOptions"]
>[0];

interface CreatePaymentMethodSetupSessionOptions {
  mutationConfig?: Options;
}

/**
 * Mints the short-lived secret the browser confirms a new credential against.
 *
 * No `meta.errorMessage`: this one is reported in the dialog that asked for it
 * rather than as a toast, because a customer who has just pressed "Add card"
 * is looking at the dialog and needs the retry to be there.
 *
 * Nothing in the cache changes on success. The credential only exists once the
 * provider has confirmed it, which happens in `AddPaymentMethodForm`.
 */
export const useCreatePaymentMethodSetupSession = ({
  mutationConfig,
}: CreatePaymentMethodSetupSessionOptions = {}) => {
  const trpc = useTRPC();

  return useMutation(
    trpc.paymentMethods.createSetupSession.mutationOptions(mutationConfig),
  );
};
