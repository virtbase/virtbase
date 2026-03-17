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

import { cn } from "@virtbase/ui";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { authClient } from "@/lib/auth/client";

export const ResendOtp = ({ email }: { email: string }) => {
  const t = useExtracted();

  const [delaySeconds, setDelaySeconds] = useState(0);
  const [state, setState] = useState<"default" | "success" | "error">(
    "default",
  );

  const [isPending, startTransition] = useTransition();
  const executeAsync = async ({ email }: { email: string }) =>
    startTransition(async () => {
      const response = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (response.data && !response.error) {
        setState("success");
      } else {
        setState("error");
      }
    });

  useEffect(() => {
    if (state === "success") {
      setDelaySeconds(60);
    } else if (state === "error") {
      setDelaySeconds(5);
    }
  }, [state]);

  useEffect(() => {
    if (delaySeconds > 0) {
      const interval = setInterval(
        () => setDelaySeconds(delaySeconds - 1),
        1000,
      );

      return () => clearInterval(interval);
    } else {
      setState("default");
    }
  }, [delaySeconds]);

  return (
    <div className="relative mt-4 text-center font-medium text-neutral-500 text-sm">
      {state === "default" && (
        <>
          {isPending && (
            <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-1.5">
              <Spinner className="h-3 w-3" />
            </div>
          )}

          <p className={cn(isPending && "opacity-80", "text-muted-foreground")}>
            {t("Didn't receive a code?")}{" "}
            <button
              type="button"
              onClick={() => executeAsync({ email })}
              className={cn(
                "font-semibold text-foreground/80 transition-colors hover:text-foreground",
                isPending && "pointer-events-none",
              )}
            >
              {t("Resend")}
            </button>
          </p>
        </>
      )}

      {state === "success" && (
        <p className="text-muted-foreground text-sm">
          {t("Code sent successfully.")} <Delay seconds={delaySeconds} />
        </p>
      )}

      {state === "error" && (
        <p className="text-muted-foreground text-sm">
          {t("Failed to send code.")} <Delay seconds={delaySeconds} />
        </p>
      )}
    </div>
  );
};

const Delay = ({ seconds }: { seconds: number }) => {
  return (
    <span className="ml-1 text-foreground/80 text-sm tabular-nums">
      {seconds}s
    </span>
  );
};
