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

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { Session } from "@virtbase/auth";
import { users } from "@virtbase/db/schema";
import { appRouter } from "../../root";
import type { TestCaller, TestCallerResult } from "../../testing";
import { createTestCaller, mockSession } from "../../testing";

// As in `privacy.test.ts`: neither reaches anything real in a test.
mock.module("workflow/api", () => ({ start: async () => {} }));
mock.module("@virtbase/email", () => ({
  sendEmail: async () => {},
  sendBatchEmail: async () => {},
}));
mock.module("../../upstash/redis", () => ({
  redis: {
    get: async () => null,
    set: async () => "OK",
    del: async () => 1,
  },
}));

let harness: TestCallerResult;
let caller: TestCaller;
let impersonatedCaller: TestCaller;

/**
 * What Better Auth hands an admin who presses Impersonate: a session created
 * just now, in the customer's name, stamped with who is really behind it.
 */
const impersonatedSession = {
  ...mockSession,
  session: {
    ...mockSession.session,
    token: "__impersonated_token__",
    createdAt: new Date(),
    impersonatedBy: "usr_0000000000000000000000009",
  },
} satisfies Session;

beforeAll(async () => {
  harness = await createTestCaller();
  ({ caller } = harness);

  impersonatedCaller = appRouter.createCaller({
    db: harness.db as never,
    authApi: {} as never,
    apiKey: null,
    headers: harness.headers,
    setHeader: () => {},
    session: impersonatedSession,
  });

  await harness.db.insert(users).values(mockSession.user).onConflictDoNothing();
});

afterAll(async () => {
  await harness.close();
});

describe("stepUpProcedure and impersonation", () => {
  test("an impersonated session cannot request an export", async () => {
    // The response to this call carries the export passphrase - the only place
    // it ever exists. Support staff can look at an account; they cannot mail
    // themselves a decryptable copy of it.
    expect(impersonatedCaller.privacy.requestExport()).rejects.toThrow(
      /FORBIDDEN|STEP_UP/,
    );
  });

  test("an impersonated session cannot request a deletion", async () => {
    expect(impersonatedCaller.privacy.requestDeletion()).rejects.toThrow(
      /FORBIDDEN|STEP_UP/,
    );
  });

  test("the step-up dialog is told so too", async () => {
    // Otherwise the admin sees a dialog that says they are already verified and
    // a button that then fails.
    const status = await impersonatedCaller.stepUp.status();

    expect(status.satisfied).toBe(false);
  });

  test("the customer's own fresh session still passes", async () => {
    const status = await caller.stepUp.status();

    expect(status.satisfied).toBe(true);

    const result = await caller.privacy.requestExport();

    expect(result.passphrase).toBeString();
  });
});
