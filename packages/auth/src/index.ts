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

import { captureException } from "@sentry/core";
import { db } from "@virtbase/db/client";
import { createId } from "@virtbase/db/utils";
import { sendEmail } from "@virtbase/email";
import PasswordUpdated from "@virtbase/email/templates/password-updated";
import ResetPasswordLink from "@virtbase/email/templates/reset-password-link";
import { getEmailTitle } from "@virtbase/email/translations";
import {
  ADMIN_HOSTNAMES,
  APP_DOMAIN,
  APP_HOSTNAMES,
  APP_NAME,
  COOKIE_DOMAIN,
  getGravatarImage,
  PUBLIC_HOSTNAMES,
} from "@virtbase/utils";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import type { UserWithRole } from "better-auth/plugins";
import { plugins } from "./plugins";
import { syncDiscordLinkedRoleMetadata } from "./sync-discord-metadata";

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
        domain: COOKIE_DOMAIN,
      },
      defaultCookieAttributes: {
        domain: COOKIE_DOMAIN,
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
      account: {
        create: {
          after: async (account, ctx) => {
            await syncDiscordLinkedRoleMetadata(account, ctx);
          },
        },
        update: {
          after: async (account, ctx) => {
            await syncDiscordLinkedRoleMetadata(account, ctx);
          },
        },
      },
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
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 600, // 10 minutes
      sendResetPassword: async ({ url, user: providedUser }) => {
        const user = providedUser as UserWithLocale;
        if (process.env.NODE_ENV === "development") {
          console.log(`Reset password link: ${url}`);
          return;
        }

        await sendEmail({
          to: user.email,
          subject: await getEmailTitle("reset-password-link", user.locale),
          react: await ResetPasswordLink({
            email: user.email,
            url,
            locale: user.locale,
          }),
        });
      },
      onPasswordReset: async ({ user: providedUser }) => {
        const user = providedUser as UserWithLocale;
        if (process.env.NODE_ENV === "development") {
          console.log(`Password updated for user: ${user.email}`);
          return;
        }

        await sendEmail({
          to: user.email,
          subject: await getEmailTitle("password-updated", user.locale),
          react: await PasswordUpdated({
            email: user.email,
            locale: user.locale,
          }),
        });
      },
    },
    emailVerification: {
      expiresIn: 600, // 10 minutes
      autoSignInAfterVerification: true,
    },
    onAPIError: {
      onError: (error) => {
        captureException(error, {
          tags: {
            "better-auth.error": "true",
          },
        });
      },
    },
    plugins: [...plugins, ...(additionalPlugins || [])],
    session: {
      storeSessionInDatabase: true,
      preserveSessionInDatabase: true,
      expiresIn: 60 * 60 * 24 * 3, // 3 days
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
        scope: [
          // Default scopes
          "identify",
          "email",
          // Discord integration for linked roles
          process.env.DISCORD_APP_ID ? "role_connections.write" : "",
        ].filter(Boolean),
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
        locale: {
          type: "string",
          unique: false,
          required: false,
          input: true,
        },
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
export type UserWithLocale = UserWithRole & { locale?: string | null };
