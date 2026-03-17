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

"use client";

import { AnimatedSizeContainer } from "@virtbase/ui/animated-size-container";
import { Button } from "@virtbase/ui/button";
import { useExtracted } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useEffect, useState } from "react";
import { AuthMethodsSeparator } from "@/features/auth/components/auth-methods-separator";
import { DiscordButton } from "@/features/auth/components/discord-button";
import { EmailSignIn } from "@/features/auth/components/email-sign-in";
import { GitHubButton } from "@/features/auth/components/github-button";
import { GoogleButton } from "@/features/auth/components/google-button";
import { PasskeyButton } from "@/features/auth/components/passkey-button";
import { authClient } from "@/lib/auth/client";

const authMethods = [
  "google",
  "github",
  "discord",
  "email",
  "passkey",
] as const;

type AuthMethod = (typeof authMethods)[number];

export const LoginFormContext = createContext<{
  authMethod: AuthMethod | undefined;
  setAuthMethod: Dispatch<SetStateAction<AuthMethod | undefined>>;
  clickedMethod: AuthMethod | undefined;
  showPasswordField: boolean;
  setShowPasswordField: Dispatch<SetStateAction<boolean>>;
  setClickedMethod: Dispatch<SetStateAction<AuthMethod | undefined>>;
}>({
  authMethod: undefined,
  setAuthMethod: () => {},
  clickedMethod: undefined,
  showPasswordField: false,
  setShowPasswordField: () => {},
  setClickedMethod: () => {},
});

export default function LoginForm({
  methods = [...authMethods],
  next,
}: {
  methods?: AuthMethod[];
  next?: string;
}) {
  const t = useExtracted();
  const lastMethod = authClient.getLastUsedLoginMethod();

  const [clickedMethod, setClickedMethod] = useState<AuthMethod | undefined>(
    undefined,
  );

  const [authMethod, setAuthMethod] = useState<AuthMethod | undefined>(
    authMethods.find((method) => method === lastMethod) ?? "email",
  );

  const [showPasswordField, setShowPasswordField] = useState(false);

  // Reset the state when leaving the page
  useEffect(() => () => setClickedMethod(undefined), []);

  const authProviders: {
    method: AuthMethod;
    // biome-ignore lint/suspicious/noExplicitAny: components have different props
    component: React.ComponentType<any>;
    props?: Record<string, unknown>;
  }[] = [
    {
      method: "google",
      component: GoogleButton,
      props: { next },
    },
    {
      method: "github",
      component: GitHubButton,
      props: { next },
    },
    {
      method: "discord",
      component: DiscordButton,
      props: { next },
    },
    {
      method: "email",
      component: EmailSignIn,
      props: { next },
    },
    {
      method: "passkey",
      component: PasskeyButton,
      props: { next },
    },
  ];

  const currentAuthProvider = authProviders.find(
    (provider) => provider.method === authMethod,
  );

  const AuthMethodComponent = currentAuthProvider?.component;

  const showEmailPasswordOnly = authMethod === "email" && showPasswordField;

  return (
    <LoginFormContext.Provider
      value={{
        authMethod,
        setAuthMethod,
        clickedMethod,
        setClickedMethod,
        showPasswordField,
        setShowPasswordField,
      }}
    >
      <div className="flex flex-col gap-3">
        <AnimatedSizeContainer height>
          <div className="flex flex-col gap-3 p-1">
            {authMethod && (
              <div className="flex flex-col gap-3">
                {AuthMethodComponent && (
                  <AuthMethodComponent {...currentAuthProvider?.props} />
                )}

                {!showEmailPasswordOnly && authMethod === lastMethod && (
                  <div className="text-center text-xs">
                    <span className="text-muted-foreground/80">
                      {t.rich("You signed in with {method} last time", {
                        method:
                          lastMethod.charAt(0).toUpperCase() +
                          lastMethod.slice(1),
                      })}
                    </span>
                  </div>
                )}
                <AuthMethodsSeparator />
              </div>
            )}

            {showEmailPasswordOnly ? (
              <div className="mt-2">
                <Button
                  variant="secondary"
                  type="button"
                  className="w-full"
                  onClick={() => setShowPasswordField(false)}
                >
                  {t("Continue with another method")}
                </Button>
              </div>
            ) : (
              authProviders
                .filter(
                  (provider) =>
                    provider.method !== authMethod &&
                    methods.includes(provider.method),
                )
                .map((provider) => (
                  <div key={provider.method}>
                    <provider.component />
                  </div>
                ))
            )}
          </div>
        </AnimatedSizeContainer>
      </div>
    </LoginFormContext.Provider>
  );
}
