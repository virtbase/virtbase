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
import { Discord, Github, Google } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";

export const SignUpOAuth = ({
  methods,
}: {
  methods: ("email" | "google" | "github" | "discord")[];
}) => {
  const t = useExtracted();

  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const [clickedGoogle, setClickedGoogle] = useState(false);
  const [clickedGithub, setClickedGithub] = useState(false);
  const [clickedDiscord, setClickedDiscord] = useState(false);

  useEffect(() => {
    // when leave page, reset state
    return () => {
      setClickedGoogle(false);
      setClickedGithub(false);
      setClickedDiscord(false);
    };
  }, []);

  return (
    <>
      {methods.includes("google") && (
        <Button
          variant="secondary"
          onClick={() => {
            setClickedGoogle(true);
            authClient.signIn.social({
              requestSignUp: true,
              provider: "google",
              ...(next && next.length > 0 ? { callbackUrl: next } : {}),
            });
          }}
          disabled={clickedGoogle}
        >
          {clickedGoogle ? <Spinner /> : <Google />}
          {t("Continue with Google")}
        </Button>
      )}
      {methods.includes("github") && (
        <Button
          variant="secondary"
          onClick={() => {
            setClickedGithub(true);
            authClient.signIn.social({
              requestSignUp: true,
              provider: "github",
              ...(next && next.length > 0 ? { callbackUrl: next } : {}),
            });
          }}
          disabled={clickedGithub}
        >
          {clickedGithub ? <Spinner /> : <Github />}
          {t("Continue with GitHub")}
        </Button>
      )}
      {methods.includes("discord") && (
        <Button
          variant="secondary"
          onClick={() => {
            setClickedDiscord(true);
            authClient.signIn.social({
              requestSignUp: true,
              provider: "discord",
              ...(next && next.length > 0 ? { callbackUrl: next } : {}),
            });
          }}
        >
          {clickedDiscord ? <Spinner /> : <Discord />}
          {t("Continue with Discord")}
        </Button>
      )}
    </>
  );
};
