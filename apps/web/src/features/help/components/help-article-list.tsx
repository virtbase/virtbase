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

import { cn } from "@virtbase/ui";
import { LucideArrowRight, LucideChevronRight } from "@virtbase/ui/icons";
import type { HelpArticle } from "@/features/help/articles.ts";
import { IntlLink } from "@/i18n/navigation.public.ts";

/**
 * Article titles, one per row, each linking to its article.
 */
export function HelpArticleList({
  articles,
  className,
}: {
  articles: HelpArticle[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      {articles.map((article) => (
        <IntlLink
          href={`/help/article/${article.slugs.join("/")}`}
          key={article.url}
          className="group flex items-center justify-between gap-4 rounded-lg py-3 pr-4 pl-2 outline-none transition-[color,background-color,box-shadow] hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-accent/50"
          prefetch={false}
        >
          <h3 className="font-medium text-foreground/80 text-sm sm:text-base">
            {article.data.title}
          </h3>
          {/* On hover or focus the chevron slides right and turns into an arrow,
              into the extra right padding. */}
          <span aria-hidden="true" className="relative size-4 shrink-0">
            <LucideChevronRight className="absolute inset-0 size-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:opacity-0 group-focus-visible:translate-x-1 group-focus-visible:opacity-0" />
            <LucideArrowRight className="absolute inset-0 size-4 text-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100 group-focus-visible:translate-x-1 group-focus-visible:opacity-100" />
          </span>
        </IntlLink>
      ))}
    </div>
  );
}
