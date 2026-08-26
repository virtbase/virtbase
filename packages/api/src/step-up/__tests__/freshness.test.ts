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

import { describe, expect, test } from "bun:test";
import { STEP_UP_WINDOW_SECONDS } from "@virtbase/utils";
import { isSessionFreshEnough } from "../freshness";

const NOW = new Date("2026-08-26T12:00:00.000Z");

const secondsAgo = (seconds: number) =>
  new Date(NOW.getTime() - seconds * 1000);

describe("isSessionFreshEnough", () => {
  test("a session created moments ago counts as a re-authentication", () => {
    expect(isSessionFreshEnough({ createdAt: secondsAgo(5), now: NOW })).toBe(
      true,
    );
  });

  test("it holds right up to the edge of the window", () => {
    expect(
      isSessionFreshEnough({
        createdAt: secondsAgo(STEP_UP_WINDOW_SECONDS - 1),
        now: NOW,
      }),
    ).toBe(true);
  });

  test("it lapses exactly on the window, not a moment later", () => {
    expect(
      isSessionFreshEnough({
        createdAt: secondsAgo(STEP_UP_WINDOW_SECONDS),
        now: NOW,
      }),
    ).toBe(false);
  });

  test("a session from yesterday does not count", () => {
    expect(
      isSessionFreshEnough({ createdAt: secondsAgo(60 * 60 * 24), now: NOW }),
    ).toBe(false);
  });

  test("a session stamped in the future is refused rather than trusted", () => {
    // Otherwise a clock skew - or anything able to influence the stored
    // timestamp - would read as permanently fresh.
    expect(isSessionFreshEnough({ createdAt: secondsAgo(-60), now: NOW })).toBe(
      false,
    );
  });

  test("an unparseable timestamp is refused", () => {
    expect(
      isSessionFreshEnough({ createdAt: new Date("nonsense"), now: NOW }),
    ).toBe(false);
  });

  test("the window is configurable, for callers that need a tighter one", () => {
    expect(
      isSessionFreshEnough({
        createdAt: secondsAgo(120),
        now: NOW,
        windowSeconds: 60,
      }),
    ).toBe(false);
  });
});
