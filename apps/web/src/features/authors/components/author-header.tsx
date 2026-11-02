/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Button } from "@virtbase/ui/button";
import { Grid } from "@virtbase/ui/grid";
import type { LucideIcon } from "@virtbase/ui/icons";
import {
  GithubCustom,
  LucideArrowLeft,
  LucideGlobe,
  TwitterCustom,
} from "@virtbase/ui/icons";
import { getExtracted } from "next-intl/server";
import type { ComponentType } from "react";
import type { Author } from "@/features/authors/authors.ts";
import { AuthorAvatar } from "@/features/authors/components/author-avatar.tsx";
import { IntlLink } from "@/i18n/navigation.public.ts";

type LinkKind = keyof NonNullable<Author["data"]["links"]>;

const linkIcons: Record<LinkKind, LucideIcon | ComponentType> = {
  github: GithubCustom,
  x: TwitterCustom,
  website: LucideGlobe,
};

/**
 * The top of an author's page: picture, name, role and links, over the same
 * grid backdrop as the help center.
 */
export async function AuthorHeader({ author }: { author: Author }) {
  const t = await getExtracted();
  const { name, role, links = {} } = author.data;

  const labels: Record<LinkKind, string> = {
    github: "GitHub",
    x: "X",
    website: t("Website"),
  };

  return (
    <div className="relative -mt-14 overflow-hidden">
      <Grid
        cellSize={80}
        className="mask-[radial-gradient(70%_50%_at_50%_60%,black_30%,transparent)] mx-auto max-w-7xl max-sm:opacity-50"
      />
      <div className="relative mx-auto mt-6 w-full max-w-5xl px-3 pt-24 pb-10 lg:px-4 xl:px-0">
        <IntlLink
          href="/help"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
        >
          <LucideArrowLeft aria-hidden="true" className="size-4" />
          {t("Help Center")}
        </IntlLink>
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-5">
            <AuthorAvatar author={author} className="size-20 text-xl" />
            <div>
              <h1 className="font-medium text-3xl text-foreground sm:text-4xl">
                {name}
              </h1>
              {role && (
                <p className="mt-1 text-lg text-muted-foreground">{role}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {(Object.keys(linkIcons) as LinkKind[]).flatMap((kind) => {
              const href = links[kind];
              if (!href) return [];
              const Icon = linkIcons[kind];
              return (
                <Button key={kind} variant="outline" size="icon" asChild>
                  <a
                    href={href}
                    target="_blank"
                    rel="me noopener noreferrer"
                    aria-label={labels[kind]}
                  >
                    <Icon />
                  </a>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
