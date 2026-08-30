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

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realEmail from "@virtbase/email";

/**
 * Flipped per test rather than re-mocking: `mock.module` is process-wide and
 * never undone, so a second mock installed mid-file would hand a permanently
 * broken mailer to every test file that runs after this one.
 */
let deliveryFails = false;
let sent = 0;

// Captured before the mock below replaces it. `mock.module` is process-wide and
// `mock.restore()` does not undo it, so without putting the real module back
// this file hands its stub mailer to every test file that runs after it - which
// is exactly what the notification delivery-log suite needs to be real.
const realEmailModule = { ...realEmail };

afterAll(() => {
  mock.module("@virtbase/email", () => realEmailModule);
});

mock.module("@virtbase/email", () => ({
  sendEmail: async () => {
    sent += 1;
    if (deliveryFails) throw new Error("Resend rejected the message");
  },
  sendBatchEmail: async () => {},
}));

const { initAuth } = await import("../index");

const { emailAndPassword } = initAuth().options;

const user = {
  id: "usr_0000000000000000000000000",
  email: "customer@example.com",
  name: "Customer",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  deliveryFails = false;
  sent = 0;
});

describe("onPasswordReset", () => {
  test("a failed notice does not fail the reset that already happened", async () => {
    // `/reset-password` spends the token and writes the new password *before*
    // calling this hook. A throw here would report failure for a reset that
    // succeeded - and land before `revokeSessionsOnPasswordReset`, leaving the
    // sessions the customer was resetting their password to evict.
    deliveryFails = true;

    expect(
      emailAndPassword?.onPasswordReset?.({ user } as never),
    ).resolves.toBeUndefined();
  });

  test("it still tries to send", async () => {
    // Swallowing the error must not turn into skipping the notice.
    deliveryFails = true;

    await emailAndPassword?.onPasswordReset?.({ user } as never);

    expect(sent).toBe(1);
  });

  test("a successful notice is unaffected", async () => {
    await emailAndPassword?.onPasswordReset?.({ user } as never);

    expect(sent).toBe(1);
  });
});

describe("the sends that are the operation still surface failure", () => {
  // The distinction: if the email *is* the thing the user asked for, a silent
  // failure leaves them waiting for a link that will never arrive.
  test("sendResetPassword propagates", async () => {
    deliveryFails = true;

    expect(
      emailAndPassword?.sendResetPassword?.({
        user,
        url: "https://virtbase.com/reset",
        token: "tok",
      } as never),
    ).rejects.toThrow();
  });

  test("sendVerificationEmail propagates", async () => {
    deliveryFails = true;

    const { emailVerification } = initAuth().options;

    expect(
      emailVerification?.sendVerificationEmail?.({
        user,
        url: "https://virtbase.com/verify",
        token: "tok",
      } as never),
    ).rejects.toThrow();
  });
});
