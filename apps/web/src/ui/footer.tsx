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

import { cn } from "@virtbase/ui";
import { LucideExternalLink } from "@virtbase/ui/icons";
import { Logo } from "@virtbase/ui/logo";
import { APP_DOMAIN, APP_NAME, LOOKING_GLASS_URL } from "@virtbase/utils";
import { getExtracted } from "next-intl/server";
import { IntlLink } from "@/i18n/navigation.public";
import { GetOnAppStore } from "@/ui/get-on-app-store";
import { MaxWidthWrapper } from "@/ui/max-width-wrapper";
import { SocialsRow } from "@/ui/socials-row";

const linkListHeaderClassName = "text-sm font-medium text-foreground";
const linkListClassName = "flex flex-col mt-2.5 gap-3.5";
const linkListItemClassName =
  "flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground/80 transition-colors duration-75";

export async function Footer({ className }: { className?: string }) {
  const t = await getExtracted();

  return (
    <MaxWidthWrapper
      className={cn(
        "relative z-10 overflow-hidden border border-border border-b-0 bg-background py-16 backdrop-blur-lg md:rounded-t-2xl",
        className,
      )}
    >
      <footer>
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="flex flex-col gap-6">
            <div className="grow">
              <IntlLink href="/" className="block max-w-fit" prefetch={false}>
                <span className="sr-only">{APP_NAME} Logo</span>
                <Logo className="h-8 text-foreground" />
              </IntlLink>
            </div>
            <SocialsRow />
            <GetOnAppStore />
          </div>
          <div className="mt-16 grid grid-cols-2 gap-4 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2">
              <div className="grid gap-8">
                <div></div>
              </div>
              {/*  className="mt-10 md:mt-0 */}
              <div>
                <h3 className={linkListHeaderClassName}>
                  {t("Customer Portal")}
                </h3>
                <ul className={linkListClassName}>
                  <li>
                    <a
                      href={`${APP_DOMAIN}/login`}
                      className={linkListItemClassName}
                    >
                      {t("Login")}
                    </a>
                  </li>
                  <li>
                    <a
                      href={`${APP_DOMAIN}/register`}
                      className={linkListItemClassName}
                    >
                      {t("Sign up")}
                    </a>
                  </li>
                  <li>
                    <a
                      href={`${APP_DOMAIN}/forgot-password`}
                      className={linkListItemClassName}
                    >
                      {t("Reset password")}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="md:grid md:grid-cols-2">
              <div className="grid gap-8">
                <div>
                  <h3 className={linkListHeaderClassName}>{t("Company")}</h3>
                  <ul className={linkListClassName}>
                    <li>
                      <IntlLink
                        href="/contact"
                        prefetch={false}
                        className={linkListItemClassName}
                      >
                        {t("Contact")}
                      </IntlLink>
                    </li>
                    <li>
                      <IntlLink
                        href="/help"
                        prefetch={false}
                        className={linkListItemClassName}
                      >
                        {t("Help Center")}
                      </IntlLink>
                    </li>
                    <li>
                      <a
                        href="/api/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkListItemClassName}
                      >
                        {t("API Documentation")}
                      </a>
                    </li>
                    <li>
                      <a
                        href={LOOKING_GLASS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkListItemClassName}
                      >
                        <LucideExternalLink
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span>Looking Glass</span>
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className={linkListHeaderClassName}>{t("Legal")}</h3>
                <ul className={linkListClassName}>
                  <li>
                    <IntlLink
                      href="/legal/privacy"
                      prefetch={false}
                      className={linkListItemClassName}
                    >
                      {t("Privacy Policy")}
                    </IntlLink>
                  </li>
                  <li>
                    <IntlLink
                      href="/legal/terms"
                      prefetch={false}
                      className={linkListItemClassName}
                    >
                      {t("Terms of Use")}
                    </IntlLink>
                  </li>
                  <li>
                    <IntlLink
                      href="/legal/revocation"
                      prefetch={false}
                      className={linkListItemClassName}
                    >
                      {t("Revocation Policy")}
                    </IntlLink>
                  </li>
                  <li>
                    <IntlLink
                      href="/legal/notice"
                      prefetch={false}
                      className={linkListItemClassName}
                    >
                      {t("Legal Notice")}
                    </IntlLink>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        {/* Bottom row (status, copyright) */}
        <div className="mt-12 grid grid-cols-1 place-items-center items-center gap-8 border-border border-t">
          <p className="mt-6 text-muted-foreground text-xs sm:text-right">
            {t(
              "© {year} {appName}, a brand of BeastHost UG (haftungsbeschränkt).",
              {
                year: "2026",
                appName: APP_NAME,
              },
            )}
          </p>
        </div>
      </footer>
    </MaxWidthWrapper>
  );
}
