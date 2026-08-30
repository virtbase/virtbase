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

import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { sendEmail } from "@virtbase/email";
import ConfirmIdentity from "@virtbase/email/templates/confirm-identity";
import LoginLink from "@virtbase/email/templates/login-link";
import VerifyEmail from "@virtbase/email/templates/verify-email";
import { getEmailTitle } from "@virtbase/email/translations";
import { ADMIN_DOMAIN, APP_DOMAIN, APP_NAME } from "@virtbase/utils";
import type { BetterAuthPlugin } from "better-auth";
import {
  admin,
  createAccessControl,
  emailOTP,
  lastLoginMethod,
  magicLink,
  twoFactor,
} from "better-auth/plugins";
import {
  adminAc,
  defaultStatements,
  userAc,
} from "better-auth/plugins/admin/access";
import { getUserLocaleByEmail } from "../get-user-locale-by-email";

const accessControl = createAccessControl(defaultStatements);

/**
 * How long a new API key lives when its creator names no expiry.
 *
 * A year rather than a month: these keys drive automation, and a rotation the
 * customer never sees coming is an outage. It is also the ceiling Better Auth
 * allows a caller to request (`keyExpiration.maxExpiresIn`, in days), so this
 * is the longest life a key can have rather than a default anyone can talk
 * their way past.
 */
const API_KEY_DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24 * 365;

/**
 * Exported so the configuration itself can be asserted on. The plugin object
 * Better Auth hands back keeps none of this, so a test has no other way to
 * notice that the expiry below has gone missing again.
 */
export const apiKeyOptions = {
  enableMetadata: false,
  enableSessionForAPIKeys: false,
  keyExpiration: {
    // Better Auth defaults this to `null`, which mints keys that never
    // expire. A bearer credential with no end date is one that outlives the
    // laptop, the CI job and the employee it was created for, so every key
    // gets a life unless its creator asks for a shorter one.
    defaultExpiresIn: API_KEY_DEFAULT_EXPIRY_SECONDS,
  },
  rateLimit: {
    // Handled by QStash Ratelimit in our API
    enabled: false,
  },
  references: "user",
  schema: {
    apikey: {
      modelName: "apiKey",
    },
  },
} satisfies Parameters<typeof apiKey>[0];

const customerRole = accessControl.newRole(userAc.statements);
const adminRole = accessControl.newRole(adminAc.statements);

export const plugins = [
  admin({
    defaultRole: "CUSTOMER",
    adminRoles: ["ADMIN"],
    ac: accessControl,
    roles: {
      ADMIN: adminRole,
      CUSTOMER: customerRole,
    },
  }),
  apiKey(apiKeyOptions),
  emailOTP({
    sendVerificationOnSignUp: true,
    // [!] Required, now that `sign-in` OTPs are actually sent. Without it,
    // `/sign-in/email-otp` creates a brand new user for any address that gets
    // a code - a passwordless registration path that bypasses sign-up
    // entirely. `magicLink` below disables it for the same reason.
    disableSignUp: true,
    sendVerificationOTP: async ({ email, otp, type }, ctx) => {
      // `sign-in` doubles as the step-up challenge for accounts with neither a
      // password nor a passkey: signing in again is the proof, and it mints a
      // session young enough to satisfy `isStepUpSatisfied`. See
      // `packages/api/src/step-up`.
      if (type !== "email-verification" && type !== "sign-in") {
        console.info(
          `The following OTP type was requested, but is not yet implemented: ${type}. No email will be sent.`,
        );
        return;
      }

      if (process.env.NODE_ENV === "development") {
        console.log(`OTP of type '${type}' for ${email}: ${otp}`);
        return;
      }

      const fallbackLocale = ctx?.query?.locale;
      const locale = (await getUserLocaleByEmail(email)) ?? fallbackLocale;

      const template = type === "sign-in" ? "confirm-identity" : "verify-email";

      await sendEmail({
        to: email,
        subject: await getEmailTitle(template, locale),
        react:
          type === "sign-in"
            ? await ConfirmIdentity({ email, code: otp, locale })
            : await VerifyEmail({ email, code: otp, locale }),
      });
    },
    expiresIn: 600, // 10 minutes
    allowedAttempts: 3,
    storeOTP: "encrypted",
    rateLimit: {
      window: 60,
      max: 2,
    },
  }),
  lastLoginMethod({
    storeInDatabase: false,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  }),
  magicLink({
    disableSignUp: true,
    sendMagicLink: async ({ email, url }, ctx) => {
      if (process.env.NODE_ENV === "development") {
        console.log(`Login link: ${url}`);
        return;
      }

      const fallbackLocale = ctx?.query?.locale;
      const locale = (await getUserLocaleByEmail(email)) ?? fallbackLocale;

      await sendEmail({
        to: email,
        subject: await getEmailTitle("login-link", locale),
        react: await LoginLink({ email, url, locale }),
      });
    },
    expiresIn: 300, // 5 minutes
    allowedAttempts: 1,
    rateLimit: {
      window: 60,
      max: 2,
    },
  }),
  passkey({
    rpName: APP_NAME,
    origin: [APP_DOMAIN, ADMIN_DOMAIN],
  }),
  twoFactor({
    issuer: APP_NAME,
    allowPasswordless: true,
    backupCodeOptions: {
      storeBackupCodes: "encrypted",
    },
    otpOptions: {
      storeOTP: "encrypted",
      allowedAttempts: 3,
    },
    skipVerificationOnEnable: false,
  }),
] satisfies BetterAuthPlugin[];
