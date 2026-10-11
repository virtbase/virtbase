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

import type { IntegrationHealth } from "./types";

/** A health probe's budget when the integration declares none (ADR 0003). */
export const HEALTH_BUDGET_MS = 5_000;

/** The ceiling of every health probe's budget (ADR 0003). */
export const HEALTH_BUDGET_MAX_MS = 15_000;

/** A probe's budget: the declared one, or the default, at most the ceiling. */
export const resolveHealthBudgetMs = (budgetMs = HEALTH_BUDGET_MS): number =>
  Math.min(budgetMs, HEALTH_BUDGET_MAX_MS);

/**
 * Runs one health probe within its budget ({@link resolveHealthBudgetMs}), and
 * never throws.
 *
 * A probe that throws, synchronously or not, reports `error` with the thrown
 * message; one that has not answered when the budget runs out reports `error`
 * too. The probe itself is not cancelled; the requests it
 * makes through `ctx.http` end at their own timeouts.
 */
export const probeWithinBudget = async ({
  probe,
  budgetMs,
  now = () => new Date(),
}: {
  probe: () => Promise<IntegrationHealth>;
  budgetMs?: number;
  now?: () => Date;
}): Promise<IntegrationHealth> => {
  const budget = resolveHealthBudgetMs(budgetMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<IntegrationHealth>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          status: "error",
          checkedAt: now(),
          message: `The health probe did not answer within ${budget} ms`,
        }),
      budget,
    );
  });
  const answered = Promise.resolve()
    .then(probe)
    .catch(
      (error: unknown): IntegrationHealth => ({
        status: "error",
        checkedAt: now(),
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  try {
    return await Promise.race([answered, expired]);
  } finally {
    clearTimeout(timer);
  }
};
