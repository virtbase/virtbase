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

import * as Sentry from "@sentry/node";
import { STEP_UP_WINDOW_SECONDS } from "@virtbase/utils";
import { redis } from "../upstash";

/** Namespace, so these cannot collide with the cache or the ratelimiter. */
const PREFIX = "vb:stepup:";

/**
 * Namespace for the other half of the contract: a session whose challenge has
 * already been spent.
 *
 * Separate from {@link PREFIX} because it says the opposite thing. The marker
 * above is written by a challenge and read as "proven"; this one is written by
 * {@link revokeStepUp} and read as "already used". It exists because most
 * logins never write a marker at all - a passkey or an email code satisfies
 * step-up by minting a young session - so deleting the marker on its own left
 * the freshness path free to authorise a second irreversible action.
 */
const SPENT_PREFIX = "vb:stepup-spent:";

/**
 * Records that the holder of this session has just re-authenticated.
 *
 * Keyed on the session token rather than the user, so proving yourself in one
 * browser does not quietly authorise a session someone else is holding. The
 * marker dies with the session it names.
 */
export const grantStepUp = async (sessionToken: string): Promise<void> => {
  await redis.set(`${PREFIX}${sessionToken}`, Date.now(), {
    ex: STEP_UP_WINDOW_SECONDS,
  });
};

/**
 * Whether this session carries a live re-authentication marker.
 *
 * [!] Fails **closed**. `cached()` and `once()` next door both swallow a
 * Redis outage and carry on, because a slow cache beats a broken feature.
 * The opposite is true here: the only thing this guards is irreversible
 * destruction of a customer's data, so an unreachable Redis must read as
 * "not proven" and send the customer back through the challenge.
 */
export const hasStepUp = async (sessionToken: string): Promise<boolean> => {
  try {
    return (await redis.get(`${PREFIX}${sessionToken}`)) !== null;
  } catch (error) {
    Sentry.captureException(error);

    return false;
  }
};

/**
 * Whether this session's challenge has already been spent.
 *
 * [!] Fails **closed**, for the same reason {@link hasStepUp} does: unable to
 * tell whether a challenge was already used, the safe answer is that it was.
 * The customer is sent back through a challenge they can pass; the alternative
 * is a Redis outage silently restoring the behaviour this exists to remove.
 */
export const isStepUpSpent = async (sessionToken: string): Promise<boolean> => {
  try {
    return (await redis.get(`${SPENT_PREFIX}${sessionToken}`)) !== null;
  } catch (error) {
    Sentry.captureException(error);

    return true;
  }
};

/**
 * Spends the challenge.
 *
 * Called once the guarded action has actually happened, so a single
 * re-authentication authorises a single deletion rather than everything the
 * customer clicks in the next ten minutes.
 *
 * Two writes, because there are two ways to satisfy step-up. Deleting the
 * marker only spends the password challenge; the note is what spends a session
 * that qualified on its own youth, which is how most sign-ins qualify. It
 * outlives the freshness window on purpose - once that has lapsed the session
 * cannot satisfy step-up by age anyway, so there is nothing left to record.
 */
export const revokeStepUp = async (sessionToken: string): Promise<void> => {
  try {
    await Promise.all([
      redis.del(`${PREFIX}${sessionToken}`),
      redis.set(`${SPENT_PREFIX}${sessionToken}`, Date.now(), {
        ex: STEP_UP_WINDOW_SECONDS,
      }),
    ]);
  } catch (error) {
    // The marker expires on its own; failing to spend it early is survivable.
    Sentry.captureException(error);
  }
};
