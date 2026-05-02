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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { serverPlans } from "@virtbase/db/schema";
import { FatalError } from "workflow";

type GetServerPlanStepParams = {
  serverPlanId: string;
};

export async function getServerPlanStep({
  serverPlanId,
}: GetServerPlanStepParams) {
  "use step";
  const plan = await db.transaction(
    async (tx) => {
      return tx
        .select()
        .from(serverPlans)
        .where(eq(serverPlans.id, serverPlanId))
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!plan) {
    throw new FatalError(
      `The server plan with ID "${serverPlanId}" does not exist. Aborting.`,
    );
  }

  return plan;
}
