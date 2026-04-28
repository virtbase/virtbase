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
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { sendEmail } from "@virtbase/email";
import LoginLink from "@virtbase/email/templates/login-link";
import VerifyEmail from "@virtbase/email/templates/verify-email";
import { getEmailTitle } from "@virtbase/email/translations";
import { APP_DOMAIN, APP_NAME } from "@virtbase/utils";
import type { BetterAuthPlugin } from "better-auth";
import {
  admin,
  createAccessControl,
  emailOTP,
  jwt,
  lastLoginMethod,
  magicLink,
} from "better-auth/plugins";
import {
  adminAc,
  defaultStatements,
  userAc,
} from "better-auth/plugins/admin/access";
import { getUserLocaleByEmail } from "../get-user-locale-by-email";

const accessControl = createAccessControl(defaultStatements);

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
  apiKey({
    enableMetadata: false,
    enableSessionForAPIKeys: false,
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
  }),
  emailOTP({
    sendVerificationOnSignUp: true,
    sendVerificationOTP: async ({ email, otp, type }, ctx) => {
      if (type !== "email-verification") {
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

      await sendEmail({
        to: email,
        subject: await getEmailTitle("verify-email", locale),
        react: await VerifyEmail({ email, code: otp, locale }),
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
  jwt(),
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
    expiresIn: 600, // 10 minutes
    allowedAttempts: 1,
    rateLimit: {
      window: 60,
      max: 2,
    },
  }),
  oauthProvider({
    loginPage: "/login",
    consentPage: "/consent",
    accessTokenExpiresIn: 2 * 60 * 60, // 2 hours
    refreshTokenExpiresIn: 120 * 24 * 60 * 60, // 120 days
    codeExpiresIn: 2 * 60, // 2 minutes
    prefix: {
      opaqueAccessToken: "virtbase_access_token_",
      refreshToken: "virtbase_refresh_token_",
      clientSecret: "virtbase_secret_",
    },
    scopes: [],
  }),
  passkey({
    rpName: APP_NAME,
    origin: APP_DOMAIN,
  }),
] satisfies BetterAuthPlugin[];
