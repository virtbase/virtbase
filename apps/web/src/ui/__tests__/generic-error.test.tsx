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

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { resolveRetry } from "../generic-error";

const reset = mock(() => {});
const resetBoundary = mock(() => {});
const resetQueryErrors = mock(() => {});
const refresh = mock(() => {});
const startTransition = mock((callback: () => void) => {
  callback();
});

beforeEach(() => {
  reset.mockClear();
  resetBoundary.mockClear();
  resetQueryErrors.mockClear();
  refresh.mockClear();
  startTransition.mockClear();
});

describe("resolveRetry", () => {
  test("it retries what the caller named", () => {
    resolveRetry({
      reset,
      resetBoundary,
      resetQueryErrors,
      refresh,
      startTransition,
    })();

    expect(reset).toHaveBeenCalledTimes(1);
    // The caller owns the retry; no boundary is involved, so nothing else is
    // touched - a refetch must not drag a route refresh along with it.
    expect(resetQueryErrors).not.toHaveBeenCalled();
    expect(resetBoundary).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(startTransition).not.toHaveBeenCalled();
  });

  test("it recovers a boundary it was given no other way out of", () => {
    // The shape at the ~15 `fallback={<GenericError className="border" />}`
    // call sites, which pass no props at all. All three steps are needed:
    // resetting alone leaves a `use(promise)` child holding the rejected
    // promise, refreshing alone leaves `didCatch` set and the fallback
    // mounted.
    resolveRetry({
      resetBoundary,
      resetQueryErrors,
      refresh,
      startTransition,
    })();

    expect(resetQueryErrors).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(resetBoundary).toHaveBeenCalledTimes(1);
  });

  test("it batches the recovery into one transition", () => {
    const order: string[] = [];

    resolveRetry({
      resetBoundary: () => order.push("boundary"),
      resetQueryErrors: () => order.push("queries"),
      refresh: () => order.push("refresh"),
      startTransition: (callback) => {
        order.push("transition");
        callback();
      },
    })();

    // The transition is what lets React render the subtree against the fresh
    // server payload instead of the stale one, and the query reset has to land
    // before the remount or `retryOnMount: false` throws the error straight
    // back.
    expect(order).toEqual(["transition", "queries", "refresh", "boundary"]);
  });

  test("it falls back to a route refresh when nothing can be retried", () => {
    resolveRetry({ resetQueryErrors, refresh, startTransition })();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(resetQueryErrors).not.toHaveBeenCalled();
    expect(startTransition).not.toHaveBeenCalled();
  });
});
