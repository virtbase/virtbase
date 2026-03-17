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
import { APP_DOMAIN, APP_NAME } from "@virtbase/utils";
import type { BetterAuthPlugin } from "better-auth";
import {
  admin,
  createAccessControl,
  emailOTP,
  lastLoginMethod,
  magicLink,
} from "better-auth/plugins";
import {
  adminAc,
  defaultStatements,
  userAc,
} from "better-auth/plugins/admin/access";

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
    sendVerificationOTP: async ({ email, otp, type }) => {
      if (type !== "email-verification") {
        console.info(
          `The following OTP type was requested, but is not yet implemented: ${type}`,
        );
        return;
      }

      if (process.env.NODE_ENV === "development") {
        console.log(`OTP of type '${type}' for ${email}: ${otp}`);
        return;
      }

      // TODO: Add email service
      /*await sendEmail({
        to: email,
        subject: "Dein Virtbase Bestätigungscode",
        react: VerifyEmail({ email, code: otp }),
      });*/
    },
    expiresIn: 600, // 10 minutes
    allowedAttempts: 3,
    storeOTP: "encrypted",
  }),
  lastLoginMethod({
    storeInDatabase: false,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  }),
  magicLink({
    disableSignUp: true,
    sendMagicLink: async ({ email, url }) => {
      if (process.env.NODE_ENV === "development") {
        console.log(`Magic link for ${email}: ${url}`);
        return;
      }

      // TODO: Add email service
      /*await sendEmail({
        to: email,
        subject: "Dein Virtbase Login Link",
        react: LoginLink({ email, url }),
      });*/
    },
  }),
  passkey({
    rpName: APP_NAME,
    origin: APP_DOMAIN,
  }),
] satisfies BetterAuthPlugin[];
