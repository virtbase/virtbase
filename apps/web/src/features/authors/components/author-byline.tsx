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

import { getExtracted, getFormatter } from "next-intl/server";
import type { Author } from "@/features/authors/authors.ts";
import { AuthorAvatar } from "@/features/authors/components/author-avatar.tsx";
import { IntlLink } from "@/i18n/navigation.public.ts";

/**
 * Who wrote a document and when it last changed: the authors' pictures, their
 * names linking to their pages, and the date.
 */
export async function AuthorByline({
  authors,
  lastModified,
}: {
  authors: Author[];
  lastModified?: Date | undefined;
}) {
  const t = await getExtracted();
  const format = await getFormatter();

  const names = format.list(
    authors.map((author) => (
      <IntlLink
        key={author.url}
        href={`/authors/${author.slugs.join("/")}`}
        className="font-medium text-foreground/80 transition-colors hover:text-foreground"
        prefetch={false}
      >
        {author.data.name}
      </IntlLink>
    )),
  );

  return (
    <div className="flex items-center gap-3">
      {authors.length > 0 && (
        <div className="flex -space-x-2">
          {authors.map((author) => (
            <AuthorAvatar key={author.url} author={author} className="size-9" />
          ))}
        </div>
      )}
      <div className="flex flex-col text-sm">
        {authors.length > 0 && (
          <p className="text-muted-foreground">
            {t.rich("Written by <names></names>", {
              names: () => <>{names}</>,
            })}
          </p>
        )}
        {lastModified && (
          <time
            dateTime={lastModified.toISOString()}
            className="font-light text-muted-foreground"
          >
            {t("Last updated: {date}", {
              date: format.dateTime(lastModified),
            })}
          </time>
        )}
      </div>
    </div>
  );
}
