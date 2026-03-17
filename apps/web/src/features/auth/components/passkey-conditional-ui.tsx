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

import { useRouter, useSearchParams } from "next/navigation";
import { useContext, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth/client";
import { LoginFormContext } from "./login-form";

/**
 * This component will automatically trigger the passkey login flow
 * on focus of the input field with the attribute `autoComplete="webauthn"`
 *
 * Requires an input field with the attribute `autoComplete="webauthn"`
 * to work.
 *
 * @see https://better-auth.com/docs/plugins/passkey#conditional-ui
 */
export function PasskeyConditionalUI() {
  const started = useRef(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const finalNext = searchParams?.get("next") || "/";

  const { setClickedMethod } = useContext(LoginFormContext);

  useEffect(() => {
    // Only trigger once, so that we don't have issues with React strict mode
    if (started.current) return;
    started.current = true;

    async function triggerPasskeyLogin() {
      if (!window.PublicKeyCredential) {
        // Probably not a browser that supports passkeys or ssr
        return;
      }

      const supported =
        await PublicKeyCredential.isConditionalMediationAvailable();

      if (!supported) {
        // Browser does not support conditional mediation
        return;
      }

      try {
        const response = await authClient.signIn.passkey({
          autoFill: true,
          fetchOptions: {
            onSuccess: () => {
              setClickedMethod("email");

              router.push(finalNext);
            },
          },
        });

        if (!response.data || response.error) {
          setClickedMethod(undefined);
        }
      } catch {
        // ignored as it does not break the auth flow
        setClickedMethod(undefined);
      }
    }

    void triggerPasskeyLogin();
  }, [finalNext, router.push, setClickedMethod]);

  return null;
}
