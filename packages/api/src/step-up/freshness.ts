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

import { STEP_UP_WINDOW_SECONDS } from "@virtbase/utils";

/**
 * Whether a session is young enough to count as a re-authentication on its own.
 *
 * Signing in *is* proving who you are, so a customer who authenticated a
 * moment ago should not be asked to do it again before deleting their account.
 * This is what makes the passkey and email-OTP paths work without any code of
 * their own: both end in a brand new session, which lands inside this window.
 *
 * The password path cannot use it - verifying a password does not mint a
 * session - so that one writes an explicit marker instead. Between them every
 * account shape has a way through.
 */
export const isSessionFreshEnough = ({
  createdAt,
  now = new Date(),
  windowSeconds = STEP_UP_WINDOW_SECONDS,
}: {
  createdAt: Date;
  now?: Date;
  windowSeconds?: number;
}): boolean => {
  const age = now.getTime() - createdAt.getTime();

  // A session stamped in the future is a clock problem, not a fresh login.
  // Treating it as fresh would hand out step-up to anyone who can skew a
  // timestamp, so it is refused like any other unusable value.
  if (!Number.isFinite(age) || age < 0) return false;

  return age < windowSeconds * 1000;
};
