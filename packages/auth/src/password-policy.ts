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

import { PasswordSchema } from "@virtbase/validators/auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/**
 * The password rules, in one place, on the server.
 *
 * The sign-up and reset forms already run {@link PasswordSchema} through
 * `zodResolver`, but they then call `authClient.signUp.email()` directly - so
 * every rule they show is advice a client can decline to take. Better Auth
 * itself only knows about length, and has no hook for anything else, so the
 * rest of the policy is applied here, in front of the endpoints that set a
 * password.
 *
 * The schema is imported rather than restated. A regex copied into this file
 * is a regex that disagrees with the form within a release.
 */

/**
 * Endpoints that write a password, and the body field each carries it in.
 *
 * Deliberately a list of paths rather than "any body with a password field":
 * `/sign-in/email` also carries one, and rejecting it would lock out every
 * account whose password predates the current rules - exactly the accounts
 * that most need to be able to sign in and change it.
 */
const PASSWORD_FIELD_BY_PATH = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
  "/email-otp/reset-password": "password",
  "/admin/create-user": "password",
  "/admin/set-user-password": "newPassword",
} as const satisfies Record<string, "password" | "newPassword">;

/** The paths {@link assertPasswordPolicy} guards. */
export type PasswordEndpointPath = keyof typeof PASSWORD_FIELD_BY_PATH;

/**
 * Length bounds handed to Better Auth so its own checks agree with ours.
 *
 * {@link PasswordSchema} remains the authority - the hook below enforces the
 * whole rule, these two only stop a wildly wrong password reaching the hasher
 * on a path the map above has not been taught about yet. A test asserts they
 * still match the schema, so the pair cannot drift apart in silence.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

/** What the client sees when a password fails the policy. */
export const PASSWORD_POLICY_ERROR_CODE = "PASSWORD_TOO_WEAK";

/**
 * Refuses a password that the sign-up form would not have accepted.
 *
 * A path this does not know about is left alone: the guard exists to enforce
 * the rules on the ways in, not to inspect every request Better Auth serves.
 */
export const assertPasswordPolicy = ({
  path,
  body,
}: {
  path: string | undefined;
  body: unknown;
}): void => {
  const field =
    PASSWORD_FIELD_BY_PATH[path as PasswordEndpointPath] ?? undefined;
  if (!field) return;

  const password = (body as Record<string, unknown> | null | undefined)?.[
    field
  ];

  // `/admin/create-user` takes an optional password: an account created for a
  // magic-link or social-only customer has none at all. Absence is Better
  // Auth's business, not the policy's.
  if (password === undefined || password === null) return;

  if (PasswordSchema.safeParse(password).success) return;

  throw new APIError("BAD_REQUEST", {
    code: PASSWORD_POLICY_ERROR_CODE,
    message:
      "Password must be 8-64 characters and contain an uppercase letter, a lowercase letter and a digit.",
  });
};

/**
 * The `hooks.before` middleware wiring {@link assertPasswordPolicy} into every
 * dispatch - the HTTP router and `auth.api.*` alike.
 */
export const passwordPolicyHook = createAuthMiddleware(async (ctx) => {
  assertPasswordPolicy({ path: ctx.path, body: ctx.body });
});
