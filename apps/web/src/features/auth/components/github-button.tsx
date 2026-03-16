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

import { Button } from "@virtbase/ui/button";
import { Github } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useContext } from "react";
import { authClient } from "@/lib/auth/client";
import { LoginFormContext } from "./login-form";

export function GitHubButton() {
  const t = useExtracted();

  const searchParams = useSearchParams();
  const finalNext = searchParams?.get("next");

  const { setClickedMethod, clickedMethod } = useContext(LoginFormContext);

  return (
    <Button
      variant="secondary"
      onClick={() => {
        setClickedMethod("github");
        authClient.signIn.social({
          provider: "github",
          ...(finalNext && finalNext.length > 0
            ? { callbackURL: finalNext }
            : {}),
          errorCallbackURL: "/login",
        });
      }}
      className="w-full"
      disabled={
        (clickedMethod && clickedMethod !== "github") ||
        clickedMethod === "github"
      }
    >
      {clickedMethod === "github" ? (
        <Spinner />
      ) : (
        <Github className="text-foreground" />
      )}
      {t("Continue with GitHub")}
    </Button>
  );
}
