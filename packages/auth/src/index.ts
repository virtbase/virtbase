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
import { touchLastSeen } from "@virtbase/db/queries";
import * as schema from "@virtbase/db/schema";
import { createId } from "@virtbase/db/utils";
import { sendEmail } from "@virtbase/email";
import PasswordUpdated from "@virtbase/email/templates/password-updated";
import ResetPasswordLink from "@virtbase/email/templates/reset-password-link";
import VerifyEmailLink from "@virtbase/email/templates/verify-email-link";
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
import type { AccountLinkedHandler } from "./account-linked";
import { notifyAccountLinked } from "./account-linked";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyHook,
} from "./password-policy";
import { plugins } from "./plugins";

export function initAuth({
  additionalPlugins,
  onAccountLinked,
}: {
  additionalPlugins?: BetterAuthPlugin[];
  /**
   * Called after a social account is linked or its token refreshed. Wired in
   * the composition root so this package stays free of provider-specific code.
   */
  onAccountLinked?: AccountLinkedHandler;
} = {}) {
  const config = {
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        allowUnlinkingAll: true,
        /**
         * [!] A provider listed here has its own `emailVerified` flag ignored:
         * Better Auth links its identity to an existing account with the same
         * address without asking whether the provider believes that address.
         * That is only safe for a provider that will not hand out an
         * unverified one. Google reports `email_verified` from a signed ID
         * token; GitHub reports the `verified` flag of the address itself, and
         * Discord reports the account's `verified` flag - both of which can be
         * false, and either would otherwise be enough to take over a Virtbase
         * account by registering the victim's address there.
         *
         * The consequence of leaving them out is narrow: a GitHub or Discord
         * identity whose email the provider has verified still links exactly as
         * before, because the check it now falls back to passes.
         */
        trustedProviders: ["google"],
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
      camelCase: false,
      schema,
    }),
    databaseHooks: {
      account: {
        create: {
          after: async (account, ctx) => {
            await notifyAccountLinked(account, ctx, onAccountLinked);
          },
        },
        update: {
          after: async (account, ctx) => {
            await notifyAccountLinked(account, ctx, onAccountLinked);
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            // Signing in is the clearest possible activity signal, and the one
            // that has to call off a pending inactivity deletion.
            await touchLastSeen(db, session.userId);
          },
        },
        update: {
          after: async (session) => {
            // Fires on refresh, which is what keeps a long-lived browser
            // session counting as activity rather than only its first minute.
            if (session.userId) await touchLastSeen(db, session.userId);
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
      // The coarse half of the policy; `hooks.before` applies the rest. See
      // `./password-policy`.
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
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

        // [!] Swallowed on purpose, unlike every other send in this file.
        //
        // This one is a courtesy notice, and by the time it runs the reset has
        // already happened: `/reset-password` spends the token, writes the new
        // password and only then calls this. Letting a delivery failure out
        // would abort the endpoint after the change was committed - so the
        // customer is told the reset failed while their old password no longer
        // works, and the link they would retry with is already spent.
        //
        // Worse, the throw would land before `revokeSessionsOnPasswordReset`,
        // skipping the session revocation. A reset done to evict an intruder
        // would leave that intruder signed in and tell the owner it had not
        // worked. A missing "your password changed" email is the smaller loss.
        try {
          await sendEmail({
            to: user.email,
            subject: await getEmailTitle("password-updated", user.locale),
            react: await PasswordUpdated({
              email: user.email,
              locale: user.locale,
            }),
          });
        } catch (error) {
          captureException(error, {
            tags: {
              "better-auth.error": "true",
              "email.template": "password-updated",
            },
          });
        }
      },
    },
    emailVerification: {
      expiresIn: 600, // 10 minutes
      autoSignInAfterVerification: true,
      sendOnSignUp: false,
      sendVerificationEmail: async ({ user: providedUser, url }) => {
        const user = providedUser as UserWithLocale;
        if (process.env.NODE_ENV === "development") {
          console.log(`Verification email sent to user ${user.email}:`, url);
          return;
        }

        await sendEmail({
          to: user.email,
          subject: await getEmailTitle("verify-email-link", user.locale),
          react: await VerifyEmailLink({
            email: user.email,
            url,
            locale: user.locale,
          }),
        });
      },
    },
    /**
     * The password policy, applied server-side.
     *
     * `hooks.before` runs for every dispatch - the HTTP router and `auth.api.*`
     * alike - which is what makes it reach a request that skipped the form.
     */
    hooks: {
      before: passwordPolicyHook,
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
        scope: ["identify", "email", "role_connections.write"],
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
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type { AccountLinkedHandler, LinkedAccountInfo } from "./account-linked";
export type Auth = ReturnType<typeof initAuth>;

/**
 * A session, as the database actually stores it.
 *
 * The intersection is not decoration. `initAuth` spreads its plugin list into
 * `BetterAuthPlugin[]` so callers can append their own, and that widening
 * erases every field the individual plugins declare from `$Infer`. The admin
 * plugin's `impersonatedBy` is one of them: the column exists, Better Auth
 * writes it on every impersonation, and the inferred type does not mention it -
 * which is how a support session came to look exactly like the customer's own
 * to anything that only reads the type. Adding it back here is narrower than
 * making `initAuth` generic over its plugins, and it puts the correction next
 * to the widening that causes it.
 */
export type Session = Auth["$Infer"]["Session"] & {
  session: {
    /** The admin who is wearing this account, when someone is. */
    impersonatedBy?: string | null;
  };
};
export type UserWithLocale = UserWithRole & { locale?: string | null };
