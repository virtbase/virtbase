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

import Image from "next/image";
import { getFormatter, getLocale } from "next-intl/server";
import { getAuthors } from "@/features/authors/authors.ts";
import { AuthorAvatar } from "@/features/authors/components/author-avatar.tsx";
import type { HelpArticle } from "@/features/help/articles.ts";
import { getArticleImage } from "@/features/help/articles.ts";
import { IntlLink } from "@/i18n/navigation.public.ts";

/**
 * A help article as a card: its OpenGraph image as the cover, the title and
 * description, then the authors and the date it last changed.
 */
export async function HelpArticleCard({ article }: { article: HelpArticle }) {
  const locale = await getLocale();
  const format = await getFormatter();
  const { title, description, lastModified } = article.data;
  const authors = getAuthors(article.data.authors, locale);

  return (
    <IntlLink
      href={`/help/article/${article.slugs.join("/")}`}
      prefetch={false}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-background outline-none transition-[border-color,box-shadow] hover:border-foreground/20 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {/* The same image the article sets as its `og:image`, already rendered
          at its final size - nothing for the optimizer to do. */}
      <Image
        src={getArticleImage(article)}
        alt=""
        width={1200}
        height={630}
        unoptimized
        className="aspect-1200/630 w-full border-border border-b object-cover"
      />
      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          <h3 className="line-clamp-2 font-medium text-foreground text-lg">
            {title}
          </h3>
          <p className="mt-2 line-clamp-2 text-muted-foreground text-sm">
            {description}
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex -space-x-2">
            {authors.map((author) => (
              <AuthorAvatar
                key={author.url}
                author={author}
                className="size-8"
              />
            ))}
          </div>
          {lastModified && (
            <time
              dateTime={lastModified.toISOString()}
              className="text-muted-foreground text-sm"
            >
              {format.dateTime(lastModified, { dateStyle: "long" })}
            </time>
          )}
        </div>
      </div>
    </IntlLink>
  );
}
