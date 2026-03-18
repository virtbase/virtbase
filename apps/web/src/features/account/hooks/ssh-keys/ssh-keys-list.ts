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
import type { RouterInputs, RouterOutputs } from "@virtbase/api";
import { useTRPC } from "@/lib/trpc/react";

export type GetSSHKeysListInput = RouterInputs["sshKeys"]["list"];

export type GetSSHKeysListOutput = RouterOutputs["sshKeys"]["list"];

interface GetSSHKeysList extends GetSSHKeysListInput {
  queryConfig?: never;
}

export const defaultGetSSHKeysListQuery = {
  sort: ["name:asc"],
  per_page: 100,
} satisfies GetSSHKeysListInput;

export const useSSHKeysList = ({
  queryConfig,
  ...input
}: GetSSHKeysList = {}) => {
  const trpc = useTRPC();

  return useSuspenseQuery(
    trpc.sshKeys.list.queryOptions(
      {
        ...defaultGetSSHKeysListQuery,
        ...input,
      },
      queryConfig,
    ),
  );
};
