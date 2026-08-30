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
import { hasStepUp, isStepUpSpent } from "./marker";

export { isSessionFreshEnough } from "./freshness";
export {
  grantStepUp,
  hasStepUp,
  isStepUpSpent,
  revokeStepUp,
} from "./marker";

/**
 * Whether this session may perform an irreversible action right now.
 *
 * Two ways to satisfy it, and both mean the same thing - somebody proved they
 * are this person in the last few minutes:
 *
 * 1. an explicit marker was written by the password challenge, which proves
 *    it without minting a session; or
 * 2. the session itself is that young, which covers signing in by passkey,
 *    email OTP, magic link or social login - and which is spent once, because
 *    a session stays young for the whole window whatever it is used for.
 *
 * Deliberately not Better Auth's `session.freshAge` - see
 * {@link STEP_UP_WINDOW_SECONDS} for why that option is the wrong lever.
 */
export const isStepUpSatisfied = async (session: Session): Promise<boolean> => {
  // [!] An impersonated session is an administrator wearing a customer's face.
  // Better Auth mints it with `createSession` like any other, so it is always
  // seconds old and would otherwise satisfy the check on arrival - handing
  // whoever pressed Impersonate the customer's export passphrase, or their
  // account. Support staff can look; proving you are the customer is something
  // only the customer can do.
  if (session.session.impersonatedBy) return false;

  if (await hasStepUp(session.session.token)) return true;

  if (
    !isSessionFreshEnough({ createdAt: new Date(session.session.createdAt) })
  ) {
    return false;
  }

  // One challenge, one irreversible action. Signing in leaves no marker to
  // delete, so without this the contract `revokeStepUp` documents held only
  // for the password path - see `./marker`.
  return !(await isStepUpSpent(session.session.token));
};
