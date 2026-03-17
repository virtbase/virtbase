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

import { db } from "@virtbase/db/client";
import { createId } from "@virtbase/db/utils";
import {
  ADMIN_HOSTNAMES,
  APP_DOMAIN,
  APP_HOSTNAMES,
  APP_NAME,
  getGravatarImage,
  PUBLIC_HOSTNAMES,
} from "@virtbase/utils";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { plugins } from "./plugins";

const AUTH_COOKIE_DOMAIN = process.env.VERCEL_URL
  ? `.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
  : ".virtbase.localhost";

export function initAuth({
  additionalPlugins,
}: {
  additionalPlugins?: BetterAuthPlugin[];
} = {}) {
  const config = {
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        allowUnlinkingAll: true,
        trustedProviders: ["google", "github", "discord"],
      },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        // When working on localhost, there are several issues to cross subdomain cookies (https://stackoverflow.com/a/1188145)
        // We use a custom subdomain for the cookies to work since the browser requires two dots in the domain name.
        domain: AUTH_COOKIE_DOMAIN,
      },
      defaultCookieAttributes: {
        domain: AUTH_COOKIE_DOMAIN,
      },
      database: {
        generateId: ({ model }) => {
          switch (model) {
            case "account":
              return createId({ prefix: "acc_" });
            case "user":
              return createId({ prefix: "usr_" });
            case "session":
              return createId({ prefix: "sess_" });
            case "verification":
              return createId({ prefix: "verif_" });
            case "passkey":
              return createId({ prefix: "passkey_" });
            default:
              break;
          }

          // Use the default database ID
          // generation as defined per schema
          return false;
        },
      },
    },
    appName: APP_NAME,
    baseURL: {
      allowedHosts: [
        ...PUBLIC_HOSTNAMES,
        ...APP_HOSTNAMES,
        ...ADMIN_HOSTNAMES,
      ].filter(Boolean) as string[], // Sets are not empty
      protocol: "auto",
      fallback: APP_DOMAIN,
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
    }),
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            return {
              data: {
                ...user,
                ...(!user.name && { name: user.email.split("@")[0] }),
                ...(!user.image && {
                  image: await getGravatarImage(user.email),
                }),
              },
            };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ url, user }) => {
        if (process.env.NODE_ENV === "development") {
          console.log(`Reset password link for ${user.email}: ${url}`);
          return;
        }

        // TODO: Add email service
        /*await sendEmail({
          to: user.email,
          subject: "Link zum Zurücksetzen deines Virtbase Passworts",
          react: ResetPasswordLink({ email: user.email, url }),
        });*/
      },
      onPasswordReset: async ({ user }) => {
        if (process.env.NODE_ENV === "development") {
          console.log(`Password successfully reset for ${user.email}`);
          return;
        }

        // TODO: Add email service
        /*await sendEmail({
          to: user.email,
          subject: "Dein Virtbase Passwort wurde zurückgesetzt",
          react: PasswordUpdated({ email: user.email, terminology: "reset" }),
        });*/
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
    },
    plugins: [...plugins, ...(additionalPlugins || [])],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
      // Allow sensitive actions without verification
      // TODO: Implement a proper verification mechanism
      freshAge: 0,
    },
    socialProviders: {
      discord: {
        enabled:
          !!process.env.DISCORD_CLIENT_ID &&
          !!process.env.DISCORD_CLIENT_SECRET,
        clientId: process.env.DISCORD_CLIENT_ID || "",
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
      },
      github: {
        enabled:
          !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
        clientId: process.env.GITHUB_CLIENT_ID || "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
      google: {
        enabled:
          !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },
    telemetry: {
      enabled: false,
      debug: false,
    },
    user: {
      additionalFields: {
        stripeCustomerId: {
          type: "string",
          required: false,
          unique: true,
          input: false,
        },
        role: {
          type: "string",
          required: true,
          unique: false,
          input: false,
          defaultValue: "CUSTOMER",
        },
        lastAttributedAt: {
          type: "date",
          required: false,
          unique: false,
          input: false,
        },
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
