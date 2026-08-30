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
import { PasswordSchema } from "@virtbase/validators/auth";
import { initAuth } from "../index";
import {
  assertPasswordPolicy,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_ERROR_CODE,
} from "../password-policy";

/** Passes `PasswordSchema`: mixed case, a digit, inside the length bounds. */
const STRONG = "Str0ngPassw0rd";

const refuses = (input: { path: string; body: unknown }) => {
  expect(() => assertPasswordPolicy(input)).toThrow();

  try {
    assertPasswordPolicy(input);
  } catch (error) {
    expect((error as { body?: { code?: string } }).body?.code).toBe(
      PASSWORD_POLICY_ERROR_CODE,
    );
  }
};

const allows = (input: { path: string; body: unknown }) => {
  expect(() => assertPasswordPolicy(input)).not.toThrow();
};

describe("assertPasswordPolicy", () => {
  test("it refuses a password the sign-up form would have rejected", () => {
    // The form runs `PasswordSchema` through `zodResolver` and then calls
    // `authClient.signUp.email()` directly, so every rule it shows is advice a
    // client can decline to take. This is where it stops being advice.
    refuses({ path: "/sign-up/email", body: { password: "aaaaaaaa" } });
  });

  test("it accepts one the form would have allowed", () => {
    allows({ path: "/sign-up/email", body: { password: STRONG } });
  });

  test("it refuses on every path that writes a password", () => {
    refuses({ path: "/reset-password", body: { newPassword: "aaaaaaaa" } });
    refuses({ path: "/change-password", body: { newPassword: "aaaaaaaa" } });
    refuses({
      path: "/email-otp/reset-password",
      body: { password: "aaaaaaaa" },
    });
    refuses({ path: "/admin/create-user", body: { password: "aaaaaaaa" } });
    refuses({
      path: "/admin/set-user-password",
      body: { newPassword: "aaaaaaaa" },
    });
  });

  test("it leaves signing in alone", () => {
    // An account whose password predates the current rules has to be able to
    // sign in - that is how its owner gets to change it.
    allows({ path: "/sign-in/email", body: { password: "old" } });
  });

  test("a password-less admin create is not a policy failure", () => {
    // Magic-link and social-only customers have no credential account at all.
    allows({ path: "/admin/create-user", body: { name: "Someone" } });
  });

  test("a non-string password is refused rather than waved through", () => {
    refuses({ path: "/sign-up/email", body: { password: 12345678 } });
  });

  test("it ignores a path it does not guard", () => {
    allows({ path: "/get-session", body: undefined });
    allows({ path: undefined as unknown as string, body: undefined });
  });
});

describe("the declared bounds still match the schema", () => {
  // Better Auth is told the lengths separately because it has no hook for the
  // rest of the rule. These assertions are what stop the two drifting apart.
  const fill = (length: number) => `Aa1${"b".repeat(length - 3)}`;

  test("the minimum is the schema's minimum", () => {
    expect(PasswordSchema.safeParse(fill(PASSWORD_MIN_LENGTH)).success).toBe(
      true,
    );
    expect(
      PasswordSchema.safeParse(fill(PASSWORD_MIN_LENGTH - 1)).success,
    ).toBe(false);
  });

  test("the maximum is the schema's maximum", () => {
    expect(PasswordSchema.safeParse(fill(PASSWORD_MAX_LENGTH)).success).toBe(
      true,
    );
    expect(
      PasswordSchema.safeParse(fill(PASSWORD_MAX_LENGTH + 1)).success,
    ).toBe(false);
  });

  test("Better Auth is configured with them", () => {
    const { emailAndPassword } = initAuth().options;

    expect(emailAndPassword?.minPasswordLength).toBe(PASSWORD_MIN_LENGTH);
    expect(emailAndPassword?.maxPasswordLength).toBe(PASSWORD_MAX_LENGTH);
  });
});

describe("a client that skips the form", () => {
  test("sign-up refuses a weak password before it reaches the database", async () => {
    // The scenario the audit describes: a direct POST to
    // `/api/auth/sign-up/email` with `"aaaaaaaa"`. `auth.api.*` runs the same
    // `hooks.before` pipeline the HTTP router does, so this is that request.
    const auth = initAuth();

    const rejected = auth.api.signUpEmail({
      body: {
        email: "bypass@example.com",
        password: "aaaaaaaa",
        name: "Bypass",
      },
    });

    expect(rejected).rejects.toThrow(/8-64 characters/);
  });
});
