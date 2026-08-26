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
 * Spends the marker.
 *
 * Called once the guarded action has actually happened, so a single
 * re-authentication authorises a single deletion rather than everything the
 * customer clicks in the next ten minutes.
 */
export const revokeStepUp = async (sessionToken: string): Promise<void> => {
  try {
    await redis.del(`${PREFIX}${sessionToken}`);
  } catch (error) {
    // The marker expires on its own; failing to spend it early is survivable.
    Sentry.captureException(error);
  }
};
