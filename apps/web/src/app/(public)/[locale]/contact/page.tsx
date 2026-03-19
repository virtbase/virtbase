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

import { buttonVariants } from "@virtbase/ui/button";
import {
  LucideCode2,
  LucideHelpCircle,
  LucideLifeBuoy,
  LucideShieldUser,
} from "@virtbase/ui/icons";
import {
  constructMetadata,
  constructOpengraphUrl,
  DISCORD_INVITE_URL,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "next-intl";
import { getExtracted, setRequestLocale } from "next-intl/server";
import { IntlLink } from "@/i18n/navigation.public";
import { BlockWrapper } from "@/ui/block-wrapper";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const t = await getExtracted({
    locale,
  });

  const title = t("Contact");
  const description = t(
    "Get help with all product topics, give feedback or ask questions about billing.",
  );

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}/contact`,
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      slug: `/${locale}/contact`,
      theme: "dark",
    }),
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  "use cache";

  cacheTag("contact-page");
  cacheLife("max");

  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getExtracted({
    locale,
  });

  const items = [
    {
      icon: LucideShieldUser,
      title: t("Discord Community"),
      description: t(
        "Join the community Discord server and chat with other users.",
      ),
      button: {
        text: t("Join Discord"),
        href: DISCORD_INVITE_URL,
        external: true,
      },
    },
    {
      icon: LucideLifeBuoy,
      title: t("Support"),
      description: t(
        "Get help with all product topics, give feedback or ask questions about billing.",
      ),
      button: {
        text: t("Request Support"),
        href: "mailto:support@virtbase.com",
        external: true,
      },
    },
    {
      icon: LucideHelpCircle,
      title: t("Questions"),
      description: t(
        "Our help articles already answer many of your questions.",
      ),
      button: {
        text: t("View Help Center"),
        href: "/help",
        external: false,
      },
    },
    {
      icon: LucideCode2,
      title: t("API Documentation"),
      description: t(
        "Learn more about the API interface for developers for your projects.",
      ),
      button: {
        text: t("View API Documentation"),
        href: "/api/docs",
        external: true,
      },
    },
  ] as const;

  return (
    <main>
      <BlockWrapper variant="hero-full" className="px-8 pt-16 pb-8">
        <div className="relative mx-auto text-center sm:max-w-lg">
          <h1 className="mt-5 text-center font-medium text-4xl text-foreground sm:text-5xl sm:leading-[1.15]">
            {t("How can we help you?")}
          </h1>
          <p className="mt-4 text-pretty text-lg text-muted-foreground sm:text-xl">
            {t("Contact us and get quick help.")}
          </p>
        </div>
      </BlockWrapper>
      <BlockWrapper variant="default">
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {items.map((item, index) => {
            const Comp = item.button.external ? "a" : IntlLink;

            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: index is unique
                key={index}
                className="relative space-y-8 bg-background p-8 sm:p-12"
              >
                <item.icon
                  aria-hidden="true"
                  strokeWidth={1}
                  className="size-10 shrink-0"
                />
                <div>
                  <h2 className="font-semibold text-xl">{item.title}</h2>
                  <p className="mt-2 max-w-sm text-pretty text-base text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <div>
                  <Comp
                    className={buttonVariants()}
                    href={item.button.href}
                    {...(item.button.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {item.button.text}
                  </Comp>
                </div>
              </div>
            );
          })}
        </div>
      </BlockWrapper>
    </main>
  );
}
