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

const toastError = mock((_message: string, _options?: unknown) => "id");

// Installed before the module under test is loaded, so the `MutationCache`
// closes over the mock rather than the real toaster.
mock.module("sonner", () => ({
  toast: {
    error: toastError,
    success: mock(() => "id"),
    promise: mock(() => "id"),
  },
}));

const { createQueryClient, getMutationErrorDetail } = await import(
  "../query-client"
);

/** Runs one mutation through a real client and lets it fail. */
async function failMutation({
  error,
  meta,
}: {
  error: Error;
  meta?: { errorMessage?: string };
}) {
  const client = createQueryClient();
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async () => {
      throw error;
    },
    meta,
  });

  await expect(mutation.execute(undefined)).rejects.toThrow();
}

beforeEach(() => {
  toastError.mockClear();
});

describe("getMutationErrorDetail", () => {
  test("it keeps a message written for a person", () => {
    expect(getMutationErrorDetail(new Error("The plan is sold out."))).toBe(
      "The plan is sold out.",
    );
  });

  test("it drops a bare tRPC code", () => {
    expect(getMutationErrorDetail(new Error("FORBIDDEN"))).toBeUndefined();
    expect(
      getMutationErrorDetail(new Error("TOO_MANY_REQUESTS")),
    ).toBeUndefined();
  });

  test("it drops the API's sentinels", () => {
    // The client is meant to branch on these, never print them.
    expect(getMutationErrorDetail(new Error("ABUSE_LOCKED"))).toBeUndefined();
    expect(
      getMutationErrorDetail(new Error("STEP_UP_REQUIRED")),
    ).toBeUndefined();
  });

  test("it drops a serialised Zod issue list", () => {
    expect(
      getMutationErrorDetail(
        new Error('[{"code":"too_small","path":["name"]}]'),
      ),
    ).toBeUndefined();
  });

  test("it drops an empty or oversized message", () => {
    expect(getMutationErrorDetail(new Error("   "))).toBeUndefined();
    expect(getMutationErrorDetail(new Error("a".repeat(201)))).toBeUndefined();
  });
});

describe("the global mutation failure toast", () => {
  test("it reports a mutation that declared an errorMessage", async () => {
    await failMutation({
      error: new Error("Node unreachable."),
      meta: { errorMessage: "Could not change the server state." },
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toBe(
      "Could not change the server state.",
    );
    expect(toastError.mock.calls[0]?.[1]).toEqual({
      description: "Node unreachable.",
    });
  });

  test("it says nothing for a mutation whose call site reports the failure", async () => {
    // No `errorMessage` is the opt-out: the cache-level handler runs *in
    // addition to* a per-call `onError`, so toasting here would double up.
    await failMutation({ error: new Error("Node unreachable.") });

    expect(toastError).not.toHaveBeenCalled();
  });

  test("it shows no description when the server's message is not prose", async () => {
    await failMutation({
      error: new Error("ABUSE_LOCKED"),
      meta: { errorMessage: "Could not change the server state." },
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[1]).toEqual({ description: undefined });
  });
});
