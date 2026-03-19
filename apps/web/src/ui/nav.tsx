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
import { buttonVariants } from "@virtbase/ui/button";
import { ClientOnly } from "@virtbase/ui/client-only";
import { useScroll } from "@virtbase/ui/hooks";
import { Logo } from "@virtbase/ui/logo";
import { LayoutGroup } from "@virtbase/ui/motion";
import { APP_DOMAIN, APP_NAME } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import { useId } from "react";
import { IntlLink } from "@/i18n/navigation.public";
import { authClient } from "@/lib/auth/client";
import { MaxWidthWrapper } from "@/ui/max-width-wrapper";

export function Nav({ className }: { className?: string }) {
  const t = useExtracted();
  const layoutGroupId = useId();

  const scrolled = useScroll(40);

  const { data: session, isPending } = authClient.useSession();

  return (
    <LayoutGroup id={layoutGroupId}>
      <div className="sticky inset-x-0 top-0 z-30 w-full transition-all">
        {/* Scrolled background */}
        <div
          className={cn(
            "absolute inset-0 block border-transparent border-b transition-all",
            scrolled && "border-border bg-background/75 backdrop-blur-lg",
          )}
        />
        <MaxWidthWrapper className={cn("relative", className)}>
          <div className="flex h-14 items-center justify-between">
            <div className="grow basis-0">
              <IntlLink
                className="block w-fit py-2 pr-2"
                href="/"
                prefetch={false}
              >
                <Logo />
                <span className="sr-only">{APP_NAME}</span>
              </IntlLink>
            </div>

            {/**hidden grow basis-0 justify-end gap-2 lg:flex */}
            <ClientOnly className="flex grow basis-0 justify-end gap-2">
              {session && Object.keys(session).length > 0 ? (
                <a
                  href={APP_DOMAIN}
                  className={buttonVariants({
                    variant: "default",
                    size: "sm",
                  })}
                >
                  {t("Dashboard")}
                </a>
              ) : !isPending ? (
                <>
                  <a
                    href={`${APP_DOMAIN}/login`}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    {t("Login")}
                  </a>
                  <a
                    href={`${APP_DOMAIN}/register`}
                    className={buttonVariants({
                      variant: "default",
                      size: "sm",
                    })}
                  >
                    {t("Sign up")}
                  </a>
                </>
              ) : null}
            </ClientOnly>
          </div>
        </MaxWidthWrapper>
      </div>
    </LayoutGroup>
  );
}
