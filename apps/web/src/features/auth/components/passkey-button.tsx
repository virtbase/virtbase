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

import { Button } from "@virtbase/ui/button";
import { LucideKeyRound } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { getSafeRedirectUrl } from "@virtbase/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useContext } from "react";
import { authClient, isTwoFactorRedirect } from "@/lib/auth/client";
import { LoginFormContext } from "./login-form";

export function PasskeyButton() {
  const t = useExtracted();

  const router = useRouter();
  const searchParams = useSearchParams();
  const finalNext = getSafeRedirectUrl(searchParams?.get("next"));

  const { setClickedMethod, clickedMethod } = useContext(LoginFormContext);

  return (
    <Button
      variant="secondary"
      onClick={async () => {
        setClickedMethod("passkey");

        try {
          const response = await authClient.signIn.passkey({
            autoFill: false,
            fetchOptions: {
              // This hook runs *before* the two-factor plugin's own, so an
              // unguarded push here races the hard navigation that hook is
              // about to start.
              onSuccess: ({ data }) => {
                if (isTwoFactorRedirect(data)) {
                  return;
                }

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
      }}
      className="w-full"
      disabled={
        (clickedMethod && clickedMethod !== "passkey") ||
        clickedMethod === "passkey"
      }
    >
      {clickedMethod === "passkey" ? (
        <Spinner />
      ) : (
        <LucideKeyRound className="text-foreground" />
      )}
      {t("Continue with Passkey")}
    </Button>
  );
}
