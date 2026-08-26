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

import type { Session } from "@virtbase/auth";
import { isSessionFreshEnough } from "./freshness";
import { hasStepUp } from "./marker";

export { isSessionFreshEnough } from "./freshness";
export { grantStepUp, hasStepUp, revokeStepUp } from "./marker";

/**
 * Whether this session may perform an irreversible action right now.
 *
 * Two ways to satisfy it, and both mean the same thing - somebody proved they
 * are this person in the last few minutes:
 *
 * 1. the session itself is that young, which covers signing in by passkey,
 *    email OTP, magic link or social login; or
 * 2. an explicit marker was written by the password challenge, which proves
 *    the same thing without minting a session.
 *
 * Deliberately not Better Auth's `session.freshAge` - see
 * {@link STEP_UP_WINDOW_SECONDS} for why that option is the wrong lever.
 */
export const isStepUpSatisfied = async (session: Session): Promise<boolean> => {
  if (
    isSessionFreshEnough({ createdAt: new Date(session.session.createdAt) })
  ) {
    return true;
  }

  return hasStepUp(session.session.token);
};
