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

import { useMutation } from "@tanstack/react-query";
import { useExtracted } from "next-intl";
import { useTRPC } from "@/lib/trpc/react.tsx";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<
  TRPC["servers"]["actions"]["resetPassword"]["mutationOptions"]
>[0];

interface ResetServerPasswordOptions {
  mutationConfig?: Options;
}

export const useResetServerPassword = ({
  mutationConfig,
}: ResetServerPasswordOptions = {}) => {
  const t = useExtracted();
  const trpc = useTRPC();

  return useMutation(
    trpc.servers.actions.resetPassword.mutationOptions({
      meta: { errorMessage: t("Could not reset the password.") },
      ...mutationConfig,
    }),
  );
};
